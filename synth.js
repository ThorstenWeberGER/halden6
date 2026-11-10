// Sound engine: a small polyphonic analog-style synth on the Web Audio API.
// Signal path per voice:
//   DCO (saw, pulse, sub, noise) -> VCF (2 x lowpass = 24 dB) -> VCA
// Global path:
//   voices -> HPF -> VCA level -> chorus (stereo) -> volume -> limiter -> speakers
// The pulse wave is built as "saw minus delayed saw", so the pulse width is a
// delay time that the LFO or the envelope can modulate (that is PWM).

(function () {
  const P = {}; // current parameter values, keyed by control id
  window.PANEL.forEach(s => s.controls.forEach(c => { if ('value' in c) P[c.id] = c.value; }));

  const LFO_WAVES = ['sine', 'triangle', 'sawtooth', 'square'];
  const TEMPO_BEATS = [0, 4, 2, 1, 0.5, 0.25]; // '----', 1/1, 1/2, 1/4, 1/8, 1/16

  let ctx = null;
  const g = {};         // global nodes
  const voices = [];    // sounding voices (incl. releasing)
  let held = [];        // note stack for mono modes
  let monoVoice = null;

  // ---------- value mapping ----------
  const expMap = (v, min, max) => min * Math.pow(max / min, v);
  const mtof = n => 440 * Math.pow(2, (n - 69) / 12);
  const attack = () => expMap(P.envA, 0.001, 3);
  const decay = () => expMap(P.envD, 0.005, 10);
  const release = () => expMap(P.envR, 0.005, 10);
  const cutoff = () => expMap(P.vcfFreq, 30, 18000);
  const hpfHz = () => expMap(P.hpfFreq, 10, 1500);
  const isMono = () => !!(P.ml || P.gml);
  const velScale = v => 1 - P.velocityEnv * (1 - v.vel);
  const lfoRateHz = () => P.lfoTempo > 0
    ? ((P.bpm || 120) / 60) / TEMPO_BEATS[P.lfoTempo]
    : expMap(P.lfoRate, 0.1, 20);

  // ---------- small helpers ----------
  const set = (param, val) => param.setTargetAtTime(val, ctx.currentTime, 0.01);
  const gain = val => { const n = ctx.createGain(); n.gain.value = val; return n; };
  function hold(param, t) {
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
    else { const v = param.value; param.cancelScheduledValues(t); param.setValueAtTime(v, t); }
  }

  // ---------- global graph ----------
  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const c = ctx;

    g.bus = gain(1);
    g.hpf = c.createBiquadFilter(); g.hpf.type = 'highpass';
    g.level = gain(1);
    g.dry = gain(1);
    g.chWet = gain(0);
    g.volume = gain(0.5);
    g.limiter = c.createDynamicsCompressor();
    g.limiter.threshold.value = -6; g.limiter.ratio.value = 12; g.limiter.knee.value = 6;
    g.limiter.attack.value = 0.003; g.limiter.release.value = 0.2;

    // Chorus: two modulated delays, one per stereo side, moving in opposite directions.
    g.dl = c.createDelay(0.05); g.dr = c.createDelay(0.05);
    g.chLfo = c.createOscillator(); g.chLfo.type = 'triangle';
    g.chDepthL = gain(0); g.chDepthR = gain(0);
    g.chLfo.connect(g.chDepthL).connect(g.dl.delayTime);
    g.chLfo.connect(g.chDepthR).connect(g.dr.delayTime);
    g.merge = c.createChannelMerger(2);
    g.dl.connect(g.merge, 0, 0); g.dr.connect(g.merge, 0, 1);
    g.merge.connect(g.chWet);

    g.bus.connect(g.hpf).connect(g.level);
    g.level.connect(g.dry).connect(g.volume);
    g.level.connect(g.dl); g.level.connect(g.dr);
    g.chWet.connect(g.volume);
    g.volume.connect(g.limiter).connect(c.destination);
    g.analyser = c.createAnalyser(); g.analyser.fftSize = 2048; // feeds the live scope
    g.limiter.connect(g.analyser);

    // Global modulation sources
    g.pitch = c.createConstantSource();   // cents: tune + pitch wheel
    g.vcfBend = c.createConstantSource(); // cents: pitch wheel -> filter
    g.lfo = c.createOscillator();         // free-running LFO (Trig Mode = Off)
    g.pitch.offset.value = 0; g.vcfBend.offset.value = 0;
    [g.pitch, g.vcfBend, g.lfo, g.chLfo].forEach(n => n.start());

    // 2 seconds of white noise, looped by each voice
    g.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = g.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    applyGlobals();
  }

  function applyGlobals() {
    set(g.hpf.frequency, hpfHz());
    set(g.level.gain, P.vcaLevel * 1.2);
    set(g.volume.gain, P.volume * P.volume);
    set(g.pitch.offset, P.tune * 100 + P.pitchWheel * P.bendDco * 1200);
    set(g.vcfBend.offset, P.pitchWheel * P.bendVcf * 4800);
    set(g.lfo.frequency, lfoRateHz());
    g.lfo.type = LFO_WAVES[P.lfoWave];

    // Chorus I = slow and wide, II = faster and deeper, I+II = fast shimmer
    const c1 = P.chorus1, c2 = P.chorus2, on = c1 || c2;
    let rate = 0.5, depth = 0.0018;
    if (c1 && c2) { rate = 8; depth = 0.0002; } else if (c2) { rate = 0.83; depth = 0.0022; }
    set(g.chLfo.frequency, rate);
    set(g.chDepthL.gain, depth); set(g.chDepthR.gain, -depth);
    set(g.dl.delayTime, 0.0035); set(g.dr.delayTime, 0.0035);
    set(g.dry.gain, on ? 0.75 : 1); set(g.chWet.gain, on ? 0.75 : 0);
  }

  // ---------- voices ----------
  function makeVoice(note, vel) {
    const c = ctx, f = mtof(note);
    const v = { note, vel, freq: f, releasing: false, timer: null };

    v.saw = c.createOscillator(); v.saw.type = 'sawtooth'; v.saw.frequency.value = f;
    v.sub = c.createOscillator(); v.sub.type = 'square'; v.sub.frequency.value = f / 2;
    v.noise = c.createBufferSource(); v.noise.buffer = g.noise; v.noise.loop = true;

    v.pitchIn = gain(1); g.pitch.connect(v.pitchIn);
    v.pitchIn.connect(v.saw.detune); v.pitchIn.connect(v.sub.detune);

    v.sawGain = gain(0); v.pulseGain = gain(0); v.subGain = gain(0); v.noiseGain = gain(0);
    v.pDelay = c.createDelay(0.1);
    v.saw.connect(v.sawGain);
    v.saw.connect(v.pulseGain);
    v.saw.connect(v.pDelay).connect(gain(-1)).connect(v.pulseGain);
    v.sub.connect(v.subGain);
    v.noise.connect(v.noiseGain);

    v.lp1 = c.createBiquadFilter(); v.lp1.type = 'lowpass';
    v.lp2 = c.createBiquadFilter(); v.lp2.type = 'lowpass';
    v.vca = gain(0);
    const mix = gain(1);
    [v.sawGain, v.pulseGain, v.subGain, v.noiseGain].forEach(n => n.connect(mix));
    mix.connect(v.lp1).connect(v.lp2).connect(v.vca).connect(g.bus);

    // Envelope as a signal (0..1) so it can modulate filter and pulse width
    v.env = c.createConstantSource(); v.envGain = gain(0); v.env.connect(v.envGain);

    // LFO: own oscillator per note when Trig Mode = Auto (restarts with each note)
    if (P.lfoTrig === 0) {
      v.lfo = c.createOscillator();
      v.lfo.type = LFO_WAVES[P.lfoWave]; v.lfo.frequency.value = lfoRateHz();
    }
    v.lfoFade = gain(0); // ramps in over Delay Time
    (v.lfo || g.lfo).connect(v.lfoFade);

    v.lfoPitch = gain(0); v.lfoFilt = gain(0); v.lfoPwm = gain(0);
    v.envFilt = gain(0); v.envPwm = gain(0);
    v.bendIn = gain(1); g.vcfBend.connect(v.bendIn);

    v.lfoFade.connect(v.lfoPitch); v.lfoPitch.connect(v.saw.detune); v.lfoPitch.connect(v.sub.detune);
    v.lfoFade.connect(v.lfoPwm).connect(v.pDelay.delayTime);
    v.envGain.connect(v.envPwm).connect(v.pDelay.delayTime);
    [v.lfoFade.connect(v.lfoFilt), v.envGain.connect(v.envFilt), v.bendIn].forEach(src => {
      src.connect(v.lp1.detune); src.connect(v.lp2.detune);
    });

    [v.saw, v.sub, v.env, v.lfo].forEach(n => n && n.start());
    v.noise.start(0, Math.random() * 2);
    updateVoice(v);
    return v;
  }

  // Push current parameter values into one voice (also used for live changes)
  function updateVoice(v) {
    const f = v.freq;
    set(v.sawGain.gain, P.dcoSaw ? 0.35 : 0);
    set(v.pulseGain.gain, P.dcoPulse ? 0.35 : 0);
    set(v.subGain.gain, P.dcoSub ? P.dcoSubLevel * 0.4 : 0);
    set(v.noiseGain.gain, P.dcoNoise * 0.3);

    // Pulse width: 0.5 = square. PWM slider sets how far it moves.
    const amt = P.dcoPwm * 0.45;
    const modOn = P.dcoPwmMod === 0;
    set(v.pDelay.delayTime, (modOn ? 0.5 : 0.5 - amt) / f);
    set(v.lfoPwm.gain, modOn && P.dcoPwmSource === 0 ? amt / f : 0);
    set(v.envPwm.gain, modOn && P.dcoPwmSource === 1 ? -amt / f : 0);

    set(v.lfoPitch.gain, P.dcoLfo * P.dcoLfo * 600);

    const fc = cutoff(), kybd = P.vcfKybd * (v.note - 60) * 100;
    [v.lp1, v.lp2].forEach(lp => { set(lp.frequency, fc); set(lp.detune, kybd); });
    set(v.lp1.Q, -3);
    set(v.lp2.Q, -3 + P.vcfRes * 27);
    set(v.envFilt.gain, (P.vcfEnvPolarity === 0 ? 1 : -1) * P.vcfEnv * 7200 * velScale(v));
    set(v.lfoFilt.gain, P.vcfLfo * P.vcfLfo * 4800);

    if (v.lfo) { set(v.lfo.frequency, lfoRateHz()); v.lfo.type = LFO_WAVES[P.lfoWave]; }
  }

  function rampEnv(param, t, peak) {
    hold(param, t);
    param.linearRampToValueAtTime(peak, t + attack());
    param.setTargetAtTime(peak * P.envS, t + attack(), decay() / 4);
  }

  function envOn(v, t) {
    const peak = 0.5 * velScale(v);
    rampEnv(v.envGain.gain, t, 1);
    if (P.vcaMode === 0) rampEnv(v.vca.gain, t, peak);
    else { hold(v.vca.gain, t); v.vca.gain.linearRampToValueAtTime(peak, t + 0.003); }
    hold(v.lfoFade.gain, t);
    v.lfoFade.gain.setValueAtTime(0, t);
    v.lfoFade.gain.linearRampToValueAtTime(1, t + Math.max(0.001, P.lfoDelay * 3));
  }

  // Release a voice at time `when` (audio clock), default now
  function releaseVoice(v, when) {
    if (v.releasing || v.dead) return;
    const now = ctx.currentTime, t = Math.max(now, when || now), R = release();
    v.releasing = true;
    hold(v.envGain.gain, t); v.envGain.gain.setTargetAtTime(0, t, R / 4);
    hold(v.vca.gain, t);
    let end;
    if (P.vcaMode === 0) { v.vca.gain.setTargetAtTime(0, t, R / 4); end = R * 1.5 + 0.05; }
    else { v.vca.gain.linearRampToValueAtTime(0, t + 0.01); end = 0.05; }
    v.timer = setTimeout(() => killVoice(v), (t - now + end) * 1000);
  }

  // Remove a voice. fast = short fade first (voice stealing, panic).
  function killVoice(v, fast) {
    const i = voices.indexOf(v);
    if (i >= 0) voices.splice(i, 1);
    clearTimeout(v.timer); clearTimeout(v.offTimer);
    v.dead = true;
    const stop = () => {
      [v.saw, v.sub, v.env, v.lfo, v.noise].forEach(n => { if (n) { try { n.stop(); } catch (e) {} } });
      g.pitch.disconnect(v.pitchIn); g.vcfBend.disconnect(v.bendIn);
      if (!v.lfo) g.lfo.disconnect(v.lfoFade);
      v.vca.disconnect();
    };
    if (fast) {
      const t = ctx.currentTime;
      hold(v.vca.gain, t); v.vca.gain.linearRampToValueAtTime(0, t + 0.006);
      setTimeout(stop, 20);
    } else stop();
  }

  function glideTo(v, note, when) {
    const t = Math.max(ctx.currentTime, when || 0), f = mtof(note);
    v.note = note; v.freq = f;
    if (P.gml) {
      v.saw.frequency.setTargetAtTime(f, t, 0.03);
      v.sub.frequency.setTargetAtTime(f / 2, t, 0.03);
    } else {
      v.saw.frequency.setValueAtTime(f, t);
      v.sub.frequency.setValueAtTime(f / 2, t);
    }
    updateVoice(v);
  }

  // ---------- public note API ----------
  // `when` is an audio-clock time for sample-exact timing (used by the arpeggiator).
  function stealIfFull() {
    while (voices.length >= P.voices) {
      const victim = voices.find(v => v.releasing) || voices[0];
      killVoice(victim, true);
    }
  }

  function noteOn(note, vel = 0.8, when) {
    start();
    const t = Math.max(ctx.currentTime, when || 0);
    if (isMono()) {
      held = held.filter(n => n !== note); held.push(note);
      if (monoVoice && !monoVoice.releasing && !monoVoice.dead) { glideTo(monoVoice, note, t); return; }
      monoVoice = makeVoice(note, vel); voices.push(monoVoice); envOn(monoVoice, t);
      return;
    }
    voices.filter(v => v.note === note && !v.releasing).forEach(v => releaseVoice(v, t));
    stealIfFull();
    const v = makeVoice(note, vel);
    voices.push(v); envOn(v, t);
  }

  function noteOff(note, when) {
    if (!ctx) return;
    const t = Math.max(ctx.currentTime, when || 0);
    if (isMono()) {
      const wasTop = held[held.length - 1] === note;
      held = held.filter(n => n !== note);
      if (!monoVoice) return;
      if (held.length && wasTop) glideTo(monoVoice, held[held.length - 1], t);
      else if (!held.length) { releaseVoice(monoVoice, t); monoVoice = null; }
      return;
    }
    voices.filter(v => v.note === note && !v.releasing).forEach(v => releaseVoice(v, t));
  }

  // One note with a fixed length, starting at `when`. Overlapping notes of the
  // same pitch stay separate voices, so tied arp steps do not cut each other.
  function trigger(note, vel, when, dur) {
    start();
    const now = ctx.currentTime, t = Math.max(now, when), wait = Math.max(0, (t + dur - now - 0.03) * 1000);
    if (isMono()) {
      noteOn(note, vel, t);
      setTimeout(() => noteOff(note, t + dur), wait);
      return;
    }
    stealIfFull();
    const v = makeVoice(note, vel);
    voices.push(v); envOn(v, t);
    v.offTimer = setTimeout(() => releaseVoice(v, t + dur), wait);
  }

  function panic() {
    if (!ctx) return;
    voices.slice().forEach(v => killVoice(v, true));
    held = []; monoVoice = null;
  }

  function setParam(id, value) {
    P[id] = value;
    if (!ctx) return;
    if (id === 'ml' || id === 'gml') { panic(); return; }
    applyGlobals();
    voices.forEach(updateVoice);
  }

  // Readout text for a control value, in real units where it helps
  function format(id, v) {
    const hz = x => x >= 1000 ? (x / 1000).toFixed(1) + ' kHz' : x.toFixed(x < 10 ? 2 : 0) + ' Hz';
    const sec = x => x < 1 ? Math.round(x * 1000) + ' ms' : x.toFixed(2) + ' s';
    switch (id) {
      case 'lfoRate': return P.lfoTempo > 0 ? 'tempo sync' : hz(expMap(v, 0.1, 20));
      case 'lfoDelay': return sec(v * 3);
      case 'envA': return sec(expMap(v, 0.001, 3));
      case 'envD': case 'envR': return sec(expMap(v, 0.005, 10));
      case 'envS': return Math.round(v * 100) + ' %';
      case 'vcfFreq': return hz(expMap(v, 30, 18000));
      case 'hpfFreq': return hz(expMap(v, 10, 1500));
      case 'tune': return (v >= 0 ? '+' : '') + Math.round(v * 100) + ' ct';
      case 'bendDco': return (v * 12).toFixed(1) + ' st';
      case 'pitchWheel': return (v >= 0 ? '+' : '') + v.toFixed(2);
      case 'arpGate': return Math.round(5 + v * 95) + ' %';
      case 'arpSwing': return Math.round(v * 100) + ' %';
      default: return (v * 10).toFixed(1);
    }
  }

  window.Synth = {
    start, noteOn, noteOff, trigger, panic, setParam, format, params: P,
    now: () => (ctx ? ctx.currentTime : 0),
    analyser: () => g.analyser || null,
    // Value mappings, shared with the graphs so they show what you hear
    map: {
      attack, decay, release, cutoff, hpfHz, lfoRateHz,
      pulseWidth: () => (P.dcoPwmMod === 0 ? 0.5 : 0.5 - P.dcoPwm * 0.45),
      resQ: () => -3 + P.vcfRes * 27,
    },
    state: () => (ctx ? ctx.state : 'off'),
  };
})();
