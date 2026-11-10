// Graphs: small screens inside DCO, LFO, VCF and ENV, plus a live scope in
// the arpeggiator bar. The section graphs are drawn from the current
// settings, using the same value mappings as the sound engine. The scope
// reads the real audio output.

(function () {
  const S = window.Synth, P = S.params;
  const screens = [];     // { el, canvas, val, kind }
  let scope = null;       // the live scope screen
  let pending = false;

  // ---------- screen element ----------
  function create(kind, tag) {
    const el = document.createElement('div');
    el.className = 'screen screen-' + kind;
    el.innerHTML = `<div class="screen-head"><span class="screen-tag">${tag}</span><span class="screen-val"></span></div><canvas aria-hidden="true"></canvas>`;
    const sc = { el, kind, canvas: el.querySelector('canvas'), val: el.querySelector('.screen-val') };
    if (kind === 'scope') scope = sc; else screens.push(sc);
    return el;
  }

  // Size the canvas to its box and return a 2D context in CSS pixels
  function prep(sc) {
    const r = sc.el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (sc.canvas.width !== w || sc.canvas.height !== h) { sc.canvas.width = w; sc.canvas.height = h; }
    const g = sc.canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, r.width, r.height);
    const color = getComputedStyle(sc.el).getPropertyValue('--trace').trim() || '#d4553f';
    return { g, W: r.width, H: r.height, color };
  }

  // Draw y = f(x) for x in 0..1, with f returning -1..1 (bipolar) or 0..1
  function trace(c, f, { bipolar = true, top = 16, bottom = 6 } = {}) {
    const { g, W, H, color } = c;
    const y = v => {
      const n = bipolar ? (1 - v) / 2 : 1 - v;
      return top + Math.min(1, Math.max(0, n)) * (H - top - bottom);
    };
    g.lineWidth = 1.8; g.lineJoin = 'round'; g.strokeStyle = color;
    g.shadowColor = color; g.shadowBlur = 6;
    g.beginPath();
    const steps = Math.max(2, Math.round(W * 1.5));
    for (let i = 0; i <= steps; i++) {
      const x = i / steps, py = y(f(x, i));
      i ? g.lineTo(x * W, py) : g.moveTo(0, py);
    }
    g.stroke();
    g.shadowBlur = 0;
    return y;
  }

  function marker(c, x, label) {
    const { g, W, H } = c;
    g.save();
    g.setLineDash([3, 4]); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x * W, 16); g.lineTo(x * W, H - 4); g.stroke();
    if (label) {
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.font = '10px "JetBrains Mono", monospace';
      g.fillText(label, Math.min(x * W + 4, W - 40), H - 6);
    }
    g.restore();
  }

  // ---------- section graphs ----------
  const LFO_NAMES = ['sin', 'tri', 'saw', 'sqr'];
  const hz = x => (x >= 1000 ? (x / 1000).toFixed(1) + ' kHz' : x.toFixed(x < 10 ? 2 : 0) + ' Hz');

  const draw = {
    // Two cycles of the oscillator mix; the sub runs one cycle (an octave lower)
    wave(sc) {
      const c = prep(sc); if (!c) return;
      const w = S.map.pulseWidth();
      const on = P.dcoSaw || P.dcoPulse || (P.dcoSub && P.dcoSubLevel > 0) || P.dcoNoise > 0;
      const noise = i => (Math.sin(i * 12.9898) * 43758.5453) % 1; // fixed pseudo-random, so it does not flicker
      trace(c, (x, i) => {
        const p = (x * 2) % 1;
        let v = 0;
        if (P.dcoSaw) v += (1 - 2 * p) * 0.35;
        if (P.dcoPulse) v += (p < w ? 1 : -1) * 0.35;
        if (P.dcoSub) v += (x < 0.5 ? 1 : -1) * P.dcoSubLevel * 0.4;
        v += noise(i) * P.dcoNoise * 0.3;
        return v / 0.9;
      });
      const parts = [];
      if (P.dcoSaw) parts.push('saw');
      if (P.dcoPulse) parts.push(P.dcoPwmMod === 0 ? `pulse · PWM by ${P.dcoPwmSource ? 'ENV' : 'LFO'}` : `pulse ${Math.round(w * 100)}%`);
      if (P.dcoSub) parts.push('sub');
      if (P.dcoNoise > 0) parts.push('noise');
      sc.val.textContent = on ? parts.join(' + ') : 'silent';
    },

    // Two seconds of LFO, including the delay fade-in
    lfo(sc) {
      const c = prep(sc); if (!c) return;
      const rate = S.map.lfoRateHz(), delay = P.lfoDelay * 3, win = 2;
      trace(c, x => {
        const t = x * win, p = (t * rate) % 1;
        const amp = delay > 0 ? Math.min(1, t / delay) : 1;
        let v;
        switch (P.lfoWave) {
          case 1: v = 1 - 4 * Math.abs(p - 0.5); break;
          case 2: v = 1 - 2 * p; break;
          case 3: v = p < 0.5 ? 1 : -1; break;
          default: v = Math.sin(p * Math.PI * 2);
        }
        return v * amp * 0.9;
      });
      if (delay > 0 && delay < win) marker(c, delay / win, 'delay');
      sc.val.textContent = `${LFO_NAMES[P.lfoWave]} · ${hz(rate)}${delay > 0 ? ' · delay ' + S.format('lfoDelay', P.lfoDelay) : ''}`;
    },

    // Real frequency response of the three filters (HPF + 2 x lowpass)
    filter(sc) {
      const c = prep(sc); if (!c) return;
      const nodes = filterNodes();
      const N = 256, f = new Float32Array(N), m1 = new Float32Array(N), m2 = new Float32Array(N), m3 = new Float32Array(N), ph = new Float32Array(N);
      for (let i = 0; i < N; i++) f[i] = 20 * Math.pow(1000, i / (N - 1));
      const fc = S.map.cutoff(), fh = S.map.hpfHz();
      let db;
      if (nodes) {
        nodes.lp1.frequency.value = fc; nodes.lp1.Q.value = -3;
        nodes.lp2.frequency.value = fc; nodes.lp2.Q.value = S.map.resQ();
        nodes.hp.frequency.value = fh;
        nodes.lp1.getFrequencyResponse(f, m1, ph);
        nodes.lp2.getFrequencyResponse(f, m2, ph);
        nodes.hp.getFrequencyResponse(f, m3, ph);
        db = i => 20 * Math.log10(Math.max(1e-6, m1[i] * m2[i] * m3[i]));
      } else {
        db = i => -24 * Math.max(0, Math.log2(f[i] / fc)); // rough fallback
      }
      trace(c, (x) => {
        const i = Math.min(N - 1, Math.round(x * (N - 1)));
        return (db(i) + 48) / 66; // -48 dB .. +18 dB
      }, { bipolar: false });
      const pos = Math.log(fc / 20) / Math.log(1000);
      if (pos > 0 && pos < 1) marker(c, pos);
      sc.val.textContent = `${hz(fc)} · res ${(P.vcfRes * 10).toFixed(1)}${P.hpfFreq > 0.02 ? ' · HPF ' + hz(fh) : ''}`;
    },

    // ADSR with real proportions; the sustain hold is a fixed share for display
    env(sc) {
      const c = prep(sc); if (!c) return;
      const A = S.map.attack(), D = S.map.decay(), R = S.map.release(), Sl = P.envS;
      const hold = Math.max(0.05, (A + D + R) * 0.3);
      const total = A + D + hold + R;
      const y = trace(c, x => {
        const t = x * total;
        if (t < A) return t / A;
        if (t < A + D) return Sl + (1 - Sl) * Math.exp(-4 * (t - A) / D);
        if (t < A + D + hold) return Sl + (1 - Sl) * Math.exp(-4);
        return (Sl + (1 - Sl) * Math.exp(-4)) * Math.exp(-4 * (t - A - D - hold) / R);
      }, { bipolar: false });
      const { g, H } = c;
      g.fillStyle = 'rgba(255,255,255,0.45)'; g.font = '10px "JetBrains Mono", monospace';
      [['A', A / 2], ['D', A + D / 2], ['S', A + D + hold / 2], ['R', A + D + hold + R / 3]].forEach(([t, at]) => {
        g.fillText(t, Math.max(2, (at / total) * c.W - 3), H - 5);
      });
      const f = (id) => S.format(id, P[id]).replace(' ', '');
      sc.val.textContent = `A ${f('envA')} D ${f('envD')} S ${f('envS')} R ${f('envR')}`;
    },
  };

  let offline = null;
  function filterNodes() {
    if (offline === false) return null;
    if (!offline) {
      try {
        const ctx = new OfflineAudioContext(1, 128, 44100);
        const mk = type => { const n = ctx.createBiquadFilter(); n.type = type; return n; };
        offline = { lp1: mk('lowpass'), lp2: mk('lowpass'), hp: mk('highpass') };
      } catch (e) { offline = false; return null; }
    }
    return offline;
  }

  // ---------- live scope ----------
  let buf = null, frame = 0;
  function drawScope() {
    requestAnimationFrame(drawScope);
    if (!scope || (frame++ % 2)) return; // ~30 fps is plenty
    const an = S.analyser();
    const c = prep(scope); if (!c) return;
    if (!an) { trace(c, () => 0, { top: 3, bottom: 3 }); return; }
    if (!buf) buf = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(buf);
    // start at a rising zero crossing so the wave stands still
    let start = 0;
    for (let i = 1; i < buf.length / 2; i++) if (buf[i - 1] < 0 && buf[i] >= 0) { start = i; break; }
    const len = Math.floor(buf.length / 2);
    trace(c, x => Math.max(-1, Math.min(1, buf[start + Math.floor(x * (len - 1))] * 2.2)), { top: 3, bottom: 3 });
  }

  // ---------- public ----------
  function update() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; screens.forEach(sc => draw[sc.kind](sc)); });
  }

  function init() {
    new ResizeObserver(update).observe(document.body);
    update();
    requestAnimationFrame(drawScope);
  }

  window.Viz = { create, update, init };
})();
