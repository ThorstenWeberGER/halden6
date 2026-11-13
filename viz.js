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
        const amp = delay > 0 ? Math.max(0, Math.min(1, (t - 0.75 * delay) / (0.25 * delay))) : 1; // silent, then fades in over the last quarter
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

    // Frequency response of the sound engine's filters: the 4-pole low-pass
    // with resonance feedback k and the Juno's input share c = 0.31 in the
    // feedback, H = G (1 + c k) / (1 + k G) with G = 1 / (1 + s)^4, times the
    // one-pole HPF. As on the Juno-60, more resonance thins the bass a little.
    filter(sc) {
      const c = prep(sc); if (!c) return;
      const fc = S.map.cutoff(), fh = S.map.hpfHz(), k = S.map.resK();
      const db = f => {
        const w = f / fc;
        // (1 + jw)^4 = re + j im
        const r2 = 1 - w * w, i2 = 2 * w;
        const re = r2 * r2 - i2 * i2, im = 2 * r2 * i2;
        const lp = (1 + 0.31 * k) / Math.hypot(re + k, im);
        const wh = f / fh, hp = wh / Math.hypot(1, wh);
        return 20 * Math.log10(Math.max(1e-6, lp * hp));
      };
      trace(c, (x) => (db(20 * Math.pow(1000, x)) + 48) / 66, { bipolar: false }); // -48 dB .. +18 dB
      const pos = Math.log(fc / 20) / Math.log(1000);
      if (pos > 0 && pos < 1) marker(c, pos);
      sc.val.textContent = `${hz(fc)} · res ${(P.vcfRes * 10).toFixed(1)}${P.hpfFreq > 0.02 ? ' · HPF ' + hz(fh) : ''}`;
    },

    // ADSR with real proportions and the curves of halden6.dsp (junoEnv);
    // the sustain hold is a fixed share for display
    env(sc) {
      const c = prep(sc); if (!c) return;
      const A = S.map.attack(), D = S.map.decay(), R = S.map.release(), Sl = P.envS;
      const hold = Math.max(0.05, (A + D + R) * 0.3);
      const total = A + D + hold + R;
      const y = trace(c, x => {
        const t = x * total;
        const fall = (from, to, x) => Math.max(to, to - 0.031 + (from - to + 0.031) * Math.exp(-3.5 * x));
        if (t < A) return (1 - Math.exp(-t / A)) / 0.632;
        if (t < A + D) return fall(1, Sl, (t - A) / D);
        if (t < A + D + hold) return Sl;
        return fall(Sl, 0, (t - A - D - hold) / R);
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
