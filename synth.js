// Sound engine.
// Voices: the Faust program in dsp/juno.dsp, compiled to WebAssembly and run
// by faustwasm (vendor/faustwasm.js) with six-voice polyphony. Band-limited
// oscillators, PWM, a Moog ladder filter, envelopes and LFO all come from the
// Faust standard libraries.
// The same Faust program holds the effect after the voices: HPF, then a
// Juno-60 chorus ported from junologue-chorus (MIT, Peter Allwin).
// Browser built-ins after that: VCA level -> volume -> limiter -> speakers.
// This file owns the mapping from fader positions to real units (Hz, seconds,
// cents); the same functions feed the DSP and the graphs in viz.js.

(function () {
  const P = {}; // current parameter values, keyed by control id
  window.PANEL.forEach(s => s.controls.forEach(c => { if ('value' in c) P[c.id] = c.value; }));

  const TEMPO_BEATS = [0, 4, 2, 1, 0.5, 0.25]; // '----', 1/1, 1/2, 1/4, 1/8, 1/16
  const MAX_VOICES = 6;

  let ctx = null;
  const g = {};          // global nodes
  let faust = null;      // Faust polyphonic node, once loaded
  let pending = [];      // note events that arrived while the engine was loading
  const sent = {};       // last value sent per DSP control
  let sounding = [];     // notes currently keyed on, oldest first
  let held = [];         // note stack for mono modes
  let engineMode = '';   // 'AudioWorklet' or 'ScriptProcessor'

  // ---------- value mapping ----------
  const expMap = (v, min, max) => min * Math.pow(max / min, v);
  const attack = () => expMap(P.envA, 0.001, 3);
  const decay = () => expMap(P.envD, 0.005, 10);
  const release = () => expMap(P.envR, 0.005, 10);
  const cutoff = () => expMap(P.vcfFreq, 30, 18000);
  const hpfHz = () => expMap(P.hpfFreq, 10, 1500);
  const isMono = () => !!(P.ml || P.gml);
  const lfoRateHz = () => P.lfoTempo > 0
    ? ((P.bpm || 120) / 60) / TEMPO_BEATS[P.lfoTempo]
    : expMap(P.lfoRate, 0.1, 20);
  const ladderQ = () => 0.707 + P.vcfRes * P.vcfRes * 22;

  // Faust control values, in the units juno.dsp expects
  function dspValues() {
    return {
      pitchCents: P.tune * 100 + P.pitchWheel * P.bendDco * 1200,
      glide: P.gml ? 0.08 : 0,
      sawOn: P.dcoSaw, pulseOn: P.dcoPulse, subOn: P.dcoSub,
      subLevel: P.dcoSubLevel, noiseLevel: P.dcoNoise,
      pwmAmt: P.dcoPwm * 0.45,
      pwmMode: P.dcoPwmMod === 1 ? 0 : (P.dcoPwmSource === 0 ? 1 : 2),
      lfoRate: lfoRateHz(), lfoWave: P.lfoWave, lfoDelay: P.lfoDelay * 3,
      lfoRetrig: P.lfoTrig === 0 ? 1 : 0, lfoPitch: P.dcoLfo * P.dcoLfo * 600,
      cutoff: cutoff(), res: P.vcfRes,
      envAmt: (P.vcfEnvPolarity === 0 ? 1 : -1) * P.vcfEnv * 7200,
      lfoFilt: P.vcfLfo * P.vcfLfo * 4800, kybd: P.vcfKybd,
      bendVcf: P.pitchWheel * P.bendVcf * 4800,
      attack: attack(), decay: decay(), sustain: P.envS, release: release(),
      vcaGate: P.vcaMode, velEnv: P.velocityEnv,
      hpf: hpfHz(),
      chorusMode: P.chorus1 && P.chorus2 ? 3 : P.chorus2 ? 2 : P.chorus1 ? 1 : 0,
    };
  }

  function pushDsp() {
    if (!faust) return;
    const vals = dspValues();
    for (const k in vals) {
      if (sent[k] !== vals[k]) { faust.setParamValue('/juno/' + k, vals[k]); sent[k] = vals[k]; }
    }
  }

  // ---------- small helpers ----------
  const set = (param, val) => param.setTargetAtTime(val, ctx.currentTime, 0.01);
  const gain = val => { const n = ctx.createGain(); n.gain.value = val; return n; };

  // ---------- global graph ----------
  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const c = ctx;

    g.bus = gain(1);       // Faust output (voices + HPF + chorus, stereo)
    g.level = gain(1);
    g.volume = gain(0.5);
    g.limiter = c.createDynamicsCompressor();
    g.limiter.threshold.value = -6; g.limiter.ratio.value = 12; g.limiter.knee.value = 6;
    g.limiter.attack.value = 0.003; g.limiter.release.value = 0.2;

    g.bus.connect(g.level).connect(g.volume).connect(g.limiter).connect(c.destination);
    g.analyser = c.createAnalyser(); g.analyser.fftSize = 2048; // feeds the live scope
    g.limiter.connect(g.analyser);

    applyGlobals();
    loadFaust();
  }

  // Compile the embedded WebAssembly and create the polyphonic Faust node
  async function loadFaust() {
    try {
      const D = window.JUNO_DSP;
      const bytes = b64 => Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
      const [dspModule, mixerModule, effectModule] = await Promise.all([D.dsp, D.mixer, D.effect].map(b => WebAssembly.compile(bytes(b))));
      const gen = new window.FaustWasm.FaustPolyDspGenerator();
      const make = useScriptProcessor => gen.createNode(ctx, MAX_VOICES, 'juno',
        { module: dspModule, json: JSON.stringify(D.meta), soundfiles: {} }, mixerModule,
        { module: effectModule, json: JSON.stringify(D.effectMeta), soundfiles: {} }, useScriptProcessor, 1024);
      // AudioWorklet (own audio thread) needs the page served over http(s) or
      // run inside the app. Opened from disk, Chrome refuses it, so fall back
      // to the older ScriptProcessor, which works everywhere with more latency.
      let node;
      try { node = await make(false); } catch (e) { node = null; }
      if (!node) { node = await make(true); engineMode = 'ScriptProcessor'; } else engineMode = 'AudioWorklet';
      if (!node) throw new Error('faustwasm returned no node');
      node.connect(g.bus);
      faust = node;
      pushDsp();
      const queued = pending; pending = [];
      queued.forEach(fn => fn());
      window.dispatchEvent(new Event('juno-ready'));
    } catch (e) {
      console.error('Juno: sound engine failed to load', e);
    }
  }

  function applyGlobals() {
    set(g.level.gain, P.vcaLevel * 1.2);
    set(g.volume.gain, P.volume * P.volume);
  }

  // ---------- voices ----------
  // Run now if the engine is ready, otherwise as soon as it is
  const whenReady = fn => (faust ? fn() : pending.push(fn));

  // Key a note on, freeing the oldest one when all voices are in use
  function keyOn(note, vel) {
    const limit = isMono() ? 1 : P.voices;
    while (sounding.length >= limit) faust.keyOff(0, sounding.shift(), 0);
    faust.keyOn(0, note, Math.max(1, Math.round(vel * 127)));
    sounding.push(note);
  }

  function keyOff(note) {
    const i = sounding.indexOf(note);
    if (i < 0) return;
    sounding.splice(i, 1);
    faust.keyOff(0, note, 0);
  }

  // ---------- public note API ----------
  function noteOn(note, vel = 0.8) {
    start();
    whenReady(() => {
      if (isMono()) {
        held = held.filter(n => n !== note); held.push(note);
      } else if (sounding.includes(note)) keyOff(note);
      keyOn(note, vel);
    });
  }

  function noteOff(note) {
    if (!ctx) return;
    whenReady(() => {
      if (isMono()) {
        const wasTop = held[held.length - 1] === note;
        held = held.filter(n => n !== note);
        if (wasTop && held.length) { keyOn(held[held.length - 1], 0.8); return; }
      }
      keyOff(note);
    });
  }

  // One note with a fixed length, starting at audio-clock time `when`.
  // Used by the arpeggiator; timing follows the browser timer (a few ms).
  function trigger(note, vel, when, dur) {
    start();
    const delay = Math.max(0, (when - ctx.currentTime) * 1000);
    setTimeout(() => whenReady(() => keyOn(note, vel)), delay);
    setTimeout(() => whenReady(() => keyOff(note)), delay + dur * 1000);
  }

  function panic() {
    held = []; sounding = []; pending = [];
    // soft: voices fade out and are freed by faustwasm; a hard stop frees them
    // mid-release, and a voice reused that way may not restart its envelope
    if (faust) faust.allNotesOff(false);
  }

  function setParam(id, value) {
    const changed = P[id] !== value;
    P[id] = value;
    if (!ctx) return;
    if ((id === 'ml' || id === 'gml') && changed) panic();
    applyGlobals();
    pushDsp();
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
      // ladder resonance expressed as a biquad Q (dB) for the filter graph
      resQ: () => 20 * Math.log10(ladderQ()),
    },
    state: () => (ctx ? (faust ? ctx.state : 'loading') : 'off'),
    engine: () => engineMode,
  };
})();
