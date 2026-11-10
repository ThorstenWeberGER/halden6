// Arpeggiator: clock, the two play modes, step recording, pattern editor and
// named pattern slots. ui.js calls Arp.init() once the panel is drawn.
//
// Modes
//   Arp      plays the keys you hold, in the chosen order, over 1-4 octaves.
//   Pattern  plays a 16-step pattern. Holding C4 plays it as written; any
//            other key transposes it. Latch keeps it running after release.
//
// Timing uses the audio clock with a short look-ahead, so notes land exactly
// on the beat even when the browser is busy.

(function () {
  const S = window.Synth, P = S.params;
  const RATE_STEPS = [1, 2, 3, 4, 6, 8]; // steps per beat for 1/4, 1/8, 1/8T, 1/16, 1/16T, 1/32
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const MAX_STEPS = 16;
  const ROOT = 60; // C4: pattern plays untransposed when this key is held
  const LOOKAHEAD = 0.1, TICK_MS = 20;

  const noteName = n => NAMES[n % 12] + (Math.floor(n / 12) - 1);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const stepDur = () => 60 / P.bpm / RATE_STEPS[P.arpRate];
  const blankStep = note => ({ on: false, note: note || ROOT, vel: 0.8, gate: 0.75, tie: false });

  // Example pattern so the grid shows what it does on first open
  const EXAMPLE = {
    length: 16,
    steps: [
      [60, 1.0, 0.5], [60, 0.55, 0.3], [67, 0.8, 0.5], [72, 0.9, 0.6],
      null, [70, 0.7, 0.4], [67, 0.75, 0.5], [65, 0.6, 0.3],
      [60, 1.0, 0.5], [63, 0.6, 0.4], [67, 0.85, 1, true], [67, 0.6, 0.5],
      null, [72, 0.9, 0.4], [70, 0.65, 0.4], [67, 0.7, 0.8],
    ].map(s => s ? { on: true, note: s[0], vel: s[1], gate: s[2], tie: !!s[3] } : blankStep(60)),
  };

  let api = null;            // helpers from ui.js
  let pat = null;            // { length, steps[16] }
  let slots = [];            // 8 x { name, length, steps, bpm, rate } | null
  let selectedSlot = 0;

  // engine state
  let held = [];             // notes the arp plays, in the order pressed
  const down = new Set();    // keys physically held
  const consumed = new Set();// keys the arp took over (they do not sound directly)
  const vels = {};
  let running = false, timer = null, nextTime = 0, stepIdx = 0, arpIdx = 0;

  // recording state
  let recording = false, recPos = 0;

  // DOM refs inside the pattern editor
  const ui = {};

  // ---------- persistence ----------
  const copyPattern = p => ({ length: p.length, steps: p.steps.map(s => ({ ...s })) });
  const savePattern = () => api.store.set('juno-arp-pattern-v1', pat);
  const saveSlots = () => api.store.set('juno-arp-slots-v1', slots);

  // ---------- engine ----------
  function startClock() {
    S.start();
    running = true; stepIdx = 0; arpIdx = 0;
    nextTime = S.now() + 0.05;
    tick();
    timer = setInterval(tick, TICK_MS);
  }

  function stopClock() {
    running = false;
    clearInterval(timer);
    setPlayhead(-1);
  }

  function tick() {
    const horizon = S.now() + LOOKAHEAD;
    while (nextTime < horizon) {
      scheduleStep(nextTime, stepIdx);
      nextTime += stepDur();
      stepIdx++;
    }
  }

  // Run fn when the audio clock reaches t (for visuals only)
  const atTime = (t, fn) => setTimeout(fn, Math.max(0, (t - S.now()) * 1000));

  function arpSequence() {
    const base = P.arpOrder === 4 ? held.slice() : held.slice().sort((a, b) => a - b);
    const up = [];
    for (let o = 0; o < P.arpOctaves; o++) base.forEach(n => up.push({ note: n + 12 * o, vel: vels[n] || 0.8 }));
    if (P.arpOrder === 1) return up.reverse();
    if (P.arpOrder === 2) return up.concat(up.slice(1, -1).reverse());
    return up;
  }

  function scheduleStep(t, i) {
    const d = stepDur();
    const ts = t + (i % 2 === 1 ? P.arpSwing * 0.33 * d : 0);

    if (P.arpMode === 1) {
      const si = i % pat.length, st = pat.steps[si];
      atTime(ts, () => setPlayhead(si));
      if (!st.on || !held.length) return;
      const note = clamp(st.note + held[held.length - 1] - ROOT, 0, 127);
      const dur = st.tie ? d * 1.05 : d * (0.05 + st.gate * 0.95);
      play(note, st.vel, ts, dur);
      return;
    }

    if (!held.length) return;
    const seq = arpSequence();
    const pick = P.arpOrder === 3 ? seq[Math.floor(Math.random() * seq.length)] : seq[arpIdx % seq.length];
    arpIdx++;
    play(clamp(pick.note, 0, 127), pick.vel, ts, d * (0.05 + P.arpGate * 0.95));
  }

  function play(note, vel, t, dur) {
    S.trigger(note, vel, t, dur);
    atTime(t, () => api.flashKey(note, dur));
  }

  // ---------- key input (called by ui.js) ----------
  function keyDown(note, vel) {
    if (recording) { recordNote(note, vel); return false; } // still sounds normally
    if (!P.arpOn) return false;
    if (P.arpLatch && down.size === 0) held = []; // a new chord replaces the latched one
    down.add(note); consumed.add(note); vels[note] = vel;
    if (!held.includes(note)) held.push(note);
    if (!running) startClock();
    updateHandle();
    return true;
  }

  function keyUp(note) {
    down.delete(note);
    if (!consumed.delete(note)) return false;
    if (!P.arpLatch) {
      held = held.filter(n => n !== note);
      if (!held.length) stopClock();
    }
    return true;
  }

  function stopAll() {
    held = []; down.clear(); consumed.clear();
    stopClock();
    if (recording) stopRecording();
  }

  function paramChanged(id) {
    if (id === 'arpOn' && !P.arpOn) { held = []; stopClock(); }
    if (id === 'arpLatch' && !P.arpLatch) {
      held = held.filter(n => down.has(n));
      if (!held.length) stopClock();
    }
    if (id === 'arpMode') arpIdx = 0;
    updateHandle();
  }

  // ---------- recording ----------
  function startRecording() {
    recording = true; recPos = 0;
    api.toast('Recording: press keys one per step. Rest adds a pause. Press Rec again to finish.');
    renderGrid(); updateHandle();
  }

  function stopRecording() {
    recording = false;
    if (recPos > 0) pat.length = recPos;
    savePattern(); renderGrid(); updateHandle();
  }

  function recordNote(note, vel) {
    pat.steps[recPos] = { on: true, note, vel, gate: 0.75, tie: false };
    advanceRecording();
  }

  function recordRest() {
    if (!recording) return;
    const prev = recPos > 0 ? pat.steps[recPos - 1].note : ROOT;
    pat.steps[recPos] = blankStep(prev);
    advanceRecording();
  }

  function advanceRecording() {
    recPos++;
    if (recPos >= MAX_STEPS) { stopRecording(); api.toast('Pattern full: 16 steps recorded'); }
    else renderGrid();
  }

  // ---------- pattern editor ----------
  function el(tag, cls, html) { return api.el(tag, cls, html); }

  function renderPattern(body) {
    body.classList.add('pat');
    const tools = el('div', 'pat-tools');

    // Length
    const len = el('div', 'pat-tool');
    const lenMinus = el('button', 'step-btn', '−');
    ui.len = el('div', 'lcd lcd-num');
    const lenPlus = el('button', 'step-btn', '+');
    const lenBox = el('div', 'stepper'); lenBox.append(lenMinus, ui.len, lenPlus);
    len.append(lenBox, el('div', 'ctl-label', 'Length'));
    lenMinus.addEventListener('click', () => { if (!api.isCommenting()) setLength(pat.length - 1); });
    lenPlus.addEventListener('click', () => { if (!api.isCommenting()) setLength(pat.length + 1); });

    // Record / rest / clear
    const rec = el('div', 'pat-tool pat-actions');
    ui.rec = el('button', 'pat-btn pat-rec', '<span class="rec-dot"></span>Rec');
    const rest = el('button', 'pat-btn', 'Rest');
    const clear = el('button', 'pat-btn', 'Clear');
    rec.append(ui.rec, rest, clear);
    ui.rec.addEventListener('click', () => { if (!api.isCommenting()) (recording ? stopRecording() : startRecording()); });
    rest.addEventListener('click', () => { if (!api.isCommenting()) recordRest(); });
    clear.addEventListener('click', () => {
      if (api.isCommenting()) return;
      pat.steps = pat.steps.map(s => blankStep(s.note));
      savePattern(); renderGrid();
    });
    ui.restBtn = rest;

    // Slots
    const slotTool = el('div', 'pat-tool pat-slots');
    ui.slotName = el('input', 'slot-name');
    ui.slotName.id = 'arp-slot-name';
    ui.slotName.placeholder = 'Pattern name';
    ui.slotName.maxLength = 24;
    const save = el('button', 'pat-btn', 'Save');
    const load = el('button', 'pat-btn', 'Load');
    ui.chips = el('div', 'slot-chips');
    const slotRow = el('div', 'slot-row'); slotRow.append(ui.slotName, save, load);
    slotTool.append(slotRow, ui.chips);
    save.addEventListener('click', () => {
      if (api.isCommenting()) return;
      const name = ui.slotName.value.trim() || `Pattern ${selectedSlot + 1}`;
      slots[selectedSlot] = { name, ...copyPattern(pat), bpm: P.bpm, rate: P.arpRate };
      saveSlots(); renderChips();
      api.toast(`Saved "${name}" to slot ${selectedSlot + 1}`);
    });
    load.addEventListener('click', () => {
      if (api.isCommenting()) return;
      const sl = slots[selectedSlot];
      if (!sl) { api.toast(`Slot ${selectedSlot + 1} is empty. Save a pattern there first.`); return; }
      pat = copyPattern(sl);
      api.setValue('bpm', sl.bpm);
      api.setValue('arpRate', sl.rate);
      savePattern(); renderGrid();
      api.toast(`Loaded "${sl.name}"`);
    });

    tools.append(len, rec, slotTool);

    ui.gridWrap = el('div', 'pat-grid-wrap');
    ui.grid = el('div', 'pat-grid');
    ui.gridWrap.append(ui.grid);
    body.append(tools, ui.gridWrap);
    renderChips();
    renderGrid();
  }

  function setLength(n) {
    pat.length = clamp(n, 1, MAX_STEPS);
    savePattern(); renderGrid();
  }

  function renderChips() {
    ui.chips.innerHTML = '';
    slots.forEach((sl, i) => {
      const chip = el('button', 'slot-chip', `<b>${i + 1}</b><span>${sl ? escapeHtml(sl.name) : 'empty'}</span>`);
      chip.classList.toggle('filled', !!sl);
      chip.setAttribute('aria-pressed', i === selectedSlot);
      chip.addEventListener('click', () => {
        if (api.isCommenting()) return;
        selectedSlot = i;
        ui.slotName.value = sl ? sl.name : '';
        renderChips();
      });
      ui.chips.append(chip);
    });
  }

  function escapeHtml(s) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // Vertical drag on a bar: sets the value from the pointer position
  function barDrag(node, onValue) {
    node.addEventListener('pointerdown', e => {
      if (api.isCommenting()) return;
      e.preventDefault();
      node.setPointerCapture(e.pointerId);
      const r = node.getBoundingClientRect();
      const at = ev => onValue(clamp(1 - (ev.clientY - r.top) / r.height, 0, 1));
      at(e);
      const up = () => { node.removeEventListener('pointermove', at); node.removeEventListener('pointerup', up); savePattern(); };
      node.addEventListener('pointermove', at);
      node.addEventListener('pointerup', up);
    });
  }

  function renderGrid() {
    if (!ui.grid) return;
    ui.len.textContent = pat.length;
    ui.rec.classList.toggle('on', recording);
    ui.restBtn.disabled = !recording;
    ui.grid.innerHTML = '';
    ui.cols = [];

    ['Step', 'Note', 'Velocity', 'Gate', 'Tie'].forEach((label, r) => {
      const h = el('div', 'pat-rowlabel', label);
      h.style.gridRow = r + 1;
      ui.grid.append(h);
    });

    pat.steps.forEach((st, i) => {
      const col = i + 2;
      const inactive = i >= pat.length;
      const cells = [];
      const place = (node, row) => {
        node.style.gridColumn = col; node.style.gridRow = row;
        node.classList.toggle('inactive', inactive);
        ui.grid.append(node); cells.push(node);
      };

      const head = el('button', 'pat-step', String(i + 1));
      head.classList.toggle('on', st.on);
      head.classList.toggle('beat', i % 4 === 0);
      head.classList.toggle('rec-pos', recording && i === recPos);
      head.dataset.cid = 'arpStep' + (i + 1);
      api.registerTarget('arpStep' + (i + 1), `Step ${i + 1}`, 'Pattern');
      head.title = 'Click: note on / rest';
      head.addEventListener('click', () => { if (api.isCommenting()) return; st.on = !st.on; savePattern(); renderGrid(); });
      place(head, 1);

      const note = el('div', 'pat-note', st.on ? noteName(st.note) : '·');
      note.tabIndex = 0;
      note.title = 'Drag up/down or scroll to change the note. Double-click: C4';
      note.addEventListener('pointerdown', e => {
        if (api.isCommenting()) return;
        e.preventDefault();
        note.setPointerCapture(e.pointerId);
        const y0 = e.clientY, n0 = st.note;
        if (!st.on) { st.on = true; head.classList.add('on'); }
        const move = ev => { st.note = clamp(n0 + Math.round((y0 - ev.clientY) / 10), 24, 108); note.textContent = noteName(st.note); };
        const up = () => { note.removeEventListener('pointermove', move); note.removeEventListener('pointerup', up); savePattern(); };
        note.addEventListener('pointermove', move);
        note.addEventListener('pointerup', up);
      });
      note.addEventListener('wheel', e => {
        if (api.isCommenting()) return;
        e.preventDefault();
        st.note = clamp(st.note - Math.sign(e.deltaY), 24, 108);
        st.on = true; savePattern(); renderGrid();
      }, { passive: false });
      note.addEventListener('keydown', e => {
        const d = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0;
        if (!d) return;
        e.preventDefault(); st.note = clamp(st.note + d, 24, 108); st.on = true; savePattern(); renderGrid();
        ui.grid.querySelectorAll('.pat-note')[i].focus();
      });
      note.addEventListener('dblclick', () => { st.note = ROOT; savePattern(); renderGrid(); });
      place(note, 2);

      [['vel', 3, v => Math.round(v * 100)], ['gate', 4, v => Math.round(5 + v * 95) + '%']].forEach(([key, row, fmt]) => {
        const bar = el('div', 'pat-bar');
        bar.innerHTML = '<div class="pat-bar-fill"></div><span class="pat-bar-val"></span>';
        const fill = bar.firstChild, val = bar.lastChild;
        const show = () => { fill.style.height = (st[key] * 100) + '%'; val.textContent = fmt(st[key]); };
        show();
        bar.classList.toggle('dim', !st.on || (key === 'gate' && st.tie));
        bar.title = key === 'vel' ? 'Velocity: drag to set' : 'Gate length: drag to set';
        barDrag(bar, v => { st[key] = key === 'gate' ? v : Math.max(0.05, v); show(); });
        place(bar, row);
      });

      const tie = el('button', 'pat-tie', 'Tie');
      tie.classList.toggle('on', st.tie);
      tie.title = 'Hold this note into the next step';
      tie.addEventListener('click', () => { if (api.isCommenting()) return; st.tie = !st.tie; savePattern(); renderGrid(); });
      place(tie, 5);

      ui.cols.push(cells);
    });
    api.refreshNotes();
  }

  let playheadAt = -1;
  function setPlayhead(i) {
    if (!ui.cols) return;
    if (playheadAt >= 0 && ui.cols[playheadAt]) ui.cols[playheadAt].forEach(c => c.classList.remove('play'));
    playheadAt = i;
    if (i >= 0 && ui.cols[i]) ui.cols[i].forEach(c => c.classList.add('play'));
  }

  // Short status on the fold-out handle, visible while the panel is closed
  function updateHandle() {
    if (!api) return;
    let text = 'Off';
    if (recording) text = `Recording step ${recPos + 1}`;
    else if (P.arpOn) {
      const rate = ['1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32'][P.arpRate];
      text = `${P.arpMode ? 'Pattern' : 'Arp'} · ${rate} · ${Math.round(P.bpm)} BPM${P.arpLatch ? ' · Latch' : ''}`;
    }
    api.setHandle(text, !!P.arpOn || recording, recording);
  }

  function init(helpers) {
    api = helpers;
    const savedPat = api.store.get('juno-arp-pattern-v1', null);
    pat = savedPat && Array.isArray(savedPat.steps) && savedPat.steps.length === MAX_STEPS ? savedPat : copyPattern(EXAMPLE);
    const savedSlots = api.store.get('juno-arp-slots-v1', null);
    slots = Array.isArray(savedSlots) && savedSlots.length === 8 ? savedSlots : Array(8).fill(null);
    updateHandle();
  }

  window.Arp = { init, renderPattern, keyDown, keyUp, stopAll, paramChanged, updateHandle };
})();
