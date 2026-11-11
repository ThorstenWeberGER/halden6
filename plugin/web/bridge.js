// Inside the plugin this file replaces synth.js. It offers the same
// window.Synth interface to the panel, but the sound runs in C++: every change
// goes to the plugin, and the plugin sends back what Live changes.
//
// Messages use JUCE's web view bridge (window.__JUCE__.backend):
//   to the plugin:  'halden6' events { type: 'set' | 'gesture' | 'note' | 'wheel' | 'panic' | 'ready', ... }
//   from the plugin: 'params' { id: value, ... }, 'scope' { data: [...] }, 'host' { bpm }
//
// The plugin also hands over its current parameter values before this file
// runs, as window.__JUCE__.initialisationData.params, so the panel draws
// the right values from the first frame.

(function () {
  document.documentElement.classList.add('plugin');
  const backend = window.__JUCE__ && window.__JUCE__.backend;
  const send = msg => { if (backend) backend.emitEvent('halden6', msg); };

  const P = {}; // current values, keyed by control id
  window.PANEL.forEach(s => s.controls.forEach(c => { if ('value' in c) P[c.id] = c.value; }));
  const M = window.HaldenMapping(P);

  // Which ids are plugin parameters; the rest (pitch wheel, arpeggiator, BPM) stay here
  const init = (window.__JUCE__ && window.__JUCE__.initialisationData && window.__JUCE__.initialisationData.params) || [];
  const pluginIds = new Set();
  init.forEach(values => Object.entries(values || {}).forEach(([id, v]) => { pluginIds.add(id); P[id] = v; }));

  let gesture = null;

  function setParam(id, value) {
    if (id === 'bpm') return; // the tempo is Live's
    if (P[id] === value) return;
    P[id] = value;
    if (id === 'pitchWheel') send({ type: 'wheel', value });
    else if (pluginIds.has(id)) send({ type: 'set', id, value, inGesture: gesture === id });
  }

  // From the plugin: Live moved a parameter
  function applyFromPlugin(values) {
    Object.entries(values).forEach(([id, v]) => {
      // The plugin stores 32-bit floats, so its echo of 0.37 is 0.37000000476...:
      // treat that as no change. While you drag a control, its echo can lag behind.
      if (Math.abs(P[id] - v) < 1e-6 || id === gesture) return;
      P[id] = v;
      window.dispatchEvent(new CustomEvent('halden6-param', { detail: { id } }));
    });
  }

  // The live scope reads this like a Web Audio AnalyserNode
  let scope = null;
  const analyser = {
    fftSize: 2048,
    getFloatTimeDomainData(buf) {
      if (!scope) { buf.fill(0); return; }
      const n = Math.min(buf.length, scope.length);
      for (let i = 0; i < n; i++) buf[i] = scope[i];
      for (let i = n; i < buf.length; i++) buf[i] = 0;
    },
  };

  if (backend) {
    backend.addEventListener('params', applyFromPlugin);
    backend.addEventListener('scope', msg => { scope = msg.data; });
    backend.addEventListener('preset', msg => {
      window.dispatchEvent(new CustomEvent('halden6-preset', { detail: msg }));
    });
    backend.addEventListener('host', msg => {
      if (msg.bpm && msg.bpm !== P.bpm) {
        P.bpm = msg.bpm;
        window.dispatchEvent(new CustomEvent('halden6-param', { detail: { id: 'bpm' } }));
      }
    });
    // The arpeggiator runs in the plugin: show where it is in the pattern
    backend.addEventListener('arp', msg => { if (window.Arp) window.Arp.showPlayhead(msg.step); });
    // Keys played in Live, for step recording
    backend.addEventListener('midiNotes', msg => {
      if (window.Arp && window.Arp.isRecording()) msg.notes.forEach(([note, vel]) => window.Arp.keyDown(note, vel));
    });
  }

  const t0 = performance.now();
  window.Synth = {
    isPlugin: true,
    params: P,
    start() {},
    noteOn: (note, vel = 0.8) => send({ type: 'note', note, vel, on: true }),
    noteOff: note => send({ type: 'note', note, vel: 0, on: false }),
    // Used only by the browser arpeggiator, which the plugin does not run yet
    trigger(note, vel, when, dur) {
      const delay = Math.max(0, (when - this.now()) * 1000);
      setTimeout(() => this.noteOn(note, vel), delay);
      setTimeout(() => this.noteOff(note), delay + dur * 1000);
    },
    panic: () => send({ type: 'panic' }),
    setParam,
    // The preset shown in the panel, saved with the Live set
    initialPreset: ((window.__JUCE__ && window.__JUCE__.initialisationData && window.__JUCE__.initialisationData.preset) || [])[0] || null,
    presetChanged: (num, edited) => send({ type: 'preset', num, edited }),
    // The arpeggiator's pattern and slots, saved with the Live set
    initialArp: () => ((window.__JUCE__ && window.__JUCE__.initialisationData && window.__JUCE__.initialisationData.arp) || [])[0] || { pattern: null, slots: null },
    setArpPattern: pattern => send({ type: 'arpPattern', json: JSON.stringify(pattern) }),
    setArpSlots: slots => send({ type: 'arpSlots', json: JSON.stringify(slots) }),
    beginGesture(id) { if (pluginIds.has(id)) { gesture = id; send({ type: 'gesture', id, on: true }); } },
    endGesture(id) { if (gesture === id) { gesture = null; send({ type: 'gesture', id, on: false }); } },
    format: M.format,
    map: M.map,
    dspValues: M.dspValues,
    now: () => (performance.now() - t0) / 1000,
    analyser: () => analyser,
    state: () => 'running',
    engine: () => 'Plugin',
  };

  window.addEventListener('DOMContentLoaded', () => send({ type: 'ready' }));
})();
