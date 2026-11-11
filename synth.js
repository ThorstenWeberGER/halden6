// Sound engine.
// Voices: the Faust program in dsp/halden6.dsp, compiled to WebAssembly and run
// by faustwasm (vendor/faustwasm.js) with six-voice polyphony. Band-limited
// oscillators, PWM, a Moog ladder filter, envelopes and LFO all come from the
// Faust standard libraries.
// The same Faust program holds the effect after the voices: HPF, a Juno-60
// chorus ported from junologue-chorus (MIT, Peter Allwin), then the output
// stage: makeup gain x VCA level x volume, and a peak limiter. Then speakers.
// Fader positions become real units (Hz, seconds, cents) in mapping.js; the
// same functions feed the DSP and the graphs in viz.js.

(function () {
  const P = {}; // current parameter values, keyed by control id
  window.PANEL.forEach(s => s.controls.forEach(c => { if ('value' in c) P[c.id] = c.value; }));

  const MAX_VOICES = 6;
  const M = window.HaldenMapping(P);

  let ctx = null;
  const g = {};          // global nodes
  let faust = null;      // Faust polyphonic node, once loaded
  let pending = [];      // note events that arrived while the engine was loading
  const sent = {};       // last value sent per DSP control
  let sounding = [];     // notes currently keyed on, oldest first
  let held = [];         // note stack for mono modes
  let engineMode = '';   // 'AudioWorklet' or 'ScriptProcessor'

  const isMono = () => !!(P.ml || P.gml);

  function pushDsp() {
    if (!faust) return;
    const vals = M.dspValues();
    for (const k in vals) {
      if (sent[k] !== vals[k]) { faust.setParamValue('/halden6/' + k, vals[k]); sent[k] = vals[k]; }
    }
  }

  // ---------- global graph ----------
  function start() {
    if (ctx) { if (ctx.state !== 'running') ctx.resume(); return; }
    // iPhone: play like a music app, so the ring/silent switch does not mute it
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Faust output (voices, HPF, chorus, gain, limiter) goes straight to the
    // speakers. Level and volume live in the DSP so its limiter sees them.
    g.analyser = ctx.createAnalyser(); g.analyser.fftSize = 2048; // feeds the live scope
    loadFaust();
  }

  // Compile the embedded WebAssembly and create the polyphonic Faust node
  async function loadFaust() {
    try {
      const D = window.HALDEN_DSP;
      const bytes = b64 => Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
      const [dspModule, mixerModule, effectModule] = await Promise.all([D.dsp, D.mixer, D.effect].map(b => WebAssembly.compile(bytes(b))));
      const gen = new window.FaustWasm.FaustPolyDspGenerator();
      const make = useScriptProcessor => gen.createNode(ctx, MAX_VOICES, 'halden6',
        { module: dspModule, json: JSON.stringify(D.meta), soundfiles: {} }, mixerModule,
        { module: effectModule, json: JSON.stringify(D.effectMeta), soundfiles: {} }, useScriptProcessor, 1024);
      // AudioWorklet (own audio thread) needs the page served over http(s) or
      // run inside the app. Opened from disk, Chrome refuses it, so fall back
      // to the older ScriptProcessor, which works everywhere with more latency.
      let node;
      try { node = await make(false); } catch (e) { node = null; }
      if (!node) { node = await make(true); engineMode = 'ScriptProcessor'; } else engineMode = 'AudioWorklet';
      if (!node) throw new Error('faustwasm returned no node');
      node.connect(ctx.destination);
      node.connect(g.analyser);
      faust = node;
      pushDsp();
      const queued = pending; pending = [];
      queued.forEach(fn => fn());
      // The audio device can need ~0.5 s after the first click before its clock
      // moves; notes played before that come out late. Announce "ready" only then.
      const announce = () => (ctx.currentTime > 0 ? window.dispatchEvent(new Event('halden6-ready')) : setTimeout(announce, 50));
      announce();
    } catch (e) {
      console.error('Halden 6: sound engine failed to load', e);
    }
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
    pushDsp();
  }

  window.Synth = {
    start, noteOn, noteOff, trigger, panic, setParam, format: M.format, params: P,
    now: () => (ctx ? ctx.currentTime : 0),
    analyser: () => g.analyser || null,
    // Value mappings, shared with the graphs so they show what you hear
    map: M.map,
    // Faust control values for the current panel; plugin/tools/check.mjs
    // compares them with the plugin's C++ copy
    dspValues: M.dspValues,
    state: () => (ctx ? (faust && ctx.currentTime > 0 ? ctx.state : 'loading') : 'off'),
    engine: () => engineMode,
  };
})();
