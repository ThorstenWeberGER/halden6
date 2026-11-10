// UI: renders the panel from panel.js, handles control input, the on-screen
// and computer keyboard, and the comment mode that collects notes for Claude.

(function () {
  const $ = sel => document.querySelector(sel);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const S = window.Synth;

  // ---------- storage (best effort: the UI works without it) ----------
  const store = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} },
  };

  const controlIndex = {}; // id -> { def, section, node, render }
  const defaults = {};
  const saved = store.get('juno-patch-v1', {});
  window.PANEL.forEach(s => s.controls.forEach(c => {
    if ('value' in c) {
      defaults[c.id] = c.value;
      if (c.type !== 'wheel' && saved[c.id] != null) S.params[c.id] = saved[c.id];
    }
  }));

  let commentMode = false;
  // preset state (declared early: setValue reads it)
  const PRESET_IDS = new Set(Object.keys((window.PRESETS[0] || { values: {} }).values));
  let presetLoading = false, presetEdited = false, currentPreset = null;
  function renderPresetBar() {}
  let savePatchTimer = null;

  function setValue(id, value) {
    S.setParam(id, value);
    controlIndex[id].render();
    if (window.Arp) Arp.paramChanged(id);
    if (window.Viz) Viz.update();
    if (!presetLoading && PRESET_IDS.has(id) && currentPreset && !presetEdited) { presetEdited = true; renderPresetBar(); }
    if (id === 'lfoTempo' && controlIndex.lfoRate) controlIndex.lfoRate.render();
    clearTimeout(savePatchTimer);
    savePatchTimer = setTimeout(() => {
      const patch = {};
      Object.keys(defaults).forEach(k => { if (k !== 'pitchWheel') patch[k] = S.params[k]; });
      store.set('juno-patch-v1', patch);
    }, 300);
  }

  // Generic vertical drag. onDelta gets the change as a fraction of `range` pixels.
  function dragInput(node, getValue, apply, { range = 160, min = 0, max = 1 } = {}) {
    node.addEventListener('pointerdown', e => {
      if (commentMode) return;
      e.preventDefault();
      node.setPointerCapture(e.pointerId);
      node.classList.add('active');
      const startY = e.clientY, startV = getValue();
      const move = ev => {
        const fine = ev.shiftKey ? 0.2 : 1;
        apply(clamp(startV + ((startY - ev.clientY) / range) * (max - min) * fine, min, max));
      };
      const up = () => {
        node.classList.remove('active');
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', up);
        node.removeEventListener('pointercancel', up);
      };
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerup', up);
      node.addEventListener('pointercancel', up);
    });
    node.addEventListener('wheel', e => {
      if (commentMode) return;
      e.preventDefault();
      apply(clamp(getValue() - Math.sign(e.deltaY) * (max - min) * 0.02, min, max));
    }, { passive: false });
    node.addEventListener('keydown', e => {
      const step = (max - min) * (e.shiftKey ? 0.01 : 0.05);
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { apply(clamp(getValue() + step, min, max)); e.preventDefault(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { apply(clamp(getValue() - step, min, max)); e.preventDefault(); }
    });
  }

  // ---------- control builders ----------
  const ICONS = {
    pulse: '<svg viewBox="0 0 24 12"><path d="M1 10h5V2h6v8h5V2h6"/></svg>',
    saw: '<svg viewBox="0 0 24 12"><path d="M1 10L11 2v8l10-8v8"/></svg>',
    sub: '<svg viewBox="0 0 24 12"><path d="M1 10h11V2h11"/></svg>',
  };

  const builders = {
    slider(c) {
      const wrap = el('div', 'ctl ctl-slider');
      const fader = el('div', 'fader');
      fader.tabIndex = 0;
      fader.setAttribute('role', 'slider');
      fader.setAttribute('aria-label', c.label);
      fader.innerHTML = '<div class="fader-nums" aria-hidden="true"><span>10</span><span>5</span><span>0</span></div><div class="fader-scale"></div><div class="fader-track"><div class="fader-fill"></div></div><div class="fader-cap"></div>';
      const readout = el('div', 'readout');
      wrap.append(fader, el('div', 'ctl-label', c.label), readout);
      const render = () => {
        const v = S.params[c.id];
        fader.style.setProperty('--v', v);
        fader.setAttribute('aria-valuenow', v.toFixed(2));
        readout.textContent = S.format(c.id, v);
      };
      dragInput(fader, () => S.params[c.id], v => setValue(c.id, v), { range: 140 });
      // Click on the track jumps the cap there
      fader.addEventListener('pointerdown', e => {
        if (commentMode || e.target.classList.contains('fader-cap')) return;
        const r = fader.querySelector('.fader-track').getBoundingClientRect();
        setValue(c.id, clamp(1 - (e.clientY - r.top) / r.height, 0, 1));
      }, true);
      fader.addEventListener('dblclick', () => setValue(c.id, defaults[c.id]));
      return { node: wrap, render };
    },

    knob(c) {
      const wrap = el('div', 'ctl ctl-knob');
      const knob = el('div', 'knob');
      knob.tabIndex = 0;
      knob.setAttribute('role', 'slider');
      knob.setAttribute('aria-label', c.label);
      knob.innerHTML = '<div class="knob-ring"></div><div class="knob-body"><div class="knob-pointer"></div></div>';
      const readout = el('div', 'readout');
      wrap.append(knob, el('div', 'ctl-label', c.label), readout);
      const min = c.bipolar ? -1 : 0;
      const render = () => {
        const v = S.params[c.id];
        const frac = (v - min) / (1 - min);
        knob.style.setProperty('--angle', (-135 + frac * 270) + 'deg');
        knob.style.setProperty('--from', c.bipolar ? (v < 0 ? frac : 0.5) : 0);
        knob.style.setProperty('--to', c.bipolar ? (v < 0 ? 0.5 : frac) : frac);
        readout.textContent = c.id === 'volume' ? Math.round(v * 100) + ' %' : S.format(c.id, v);
      };
      dragInput(knob, () => S.params[c.id], v => setValue(c.id, v), { range: 180, min, max: 1 });
      knob.addEventListener('dblclick', () => setValue(c.id, defaults[c.id]));
      return { node: wrap, render };
    },

    switch(c) {
      const wrap = el('div', 'ctl ctl-switch');
      const sw = el('button', 'lever');
      sw.setAttribute('aria-label', c.label);
      sw.innerHTML = `<span class="lever-opt top">${c.options[0]}</span><span class="lever-slot"><span class="lever-thumb"></span></span><span class="lever-opt bottom">${c.options[1]}</span>`;
      wrap.append(sw, el('div', 'ctl-label', c.label));
      const render = () => {
        sw.dataset.pos = S.params[c.id];
        sw.setAttribute('aria-pressed', S.params[c.id] === 0);
      };
      sw.addEventListener('click', () => { if (!commentMode) setValue(c.id, 1 - S.params[c.id]); });
      return { node: wrap, render };
    },

    toggle(c) {
      const wrap = el('div', 'ctl ctl-toggle');
      const led = el('span', 'led');
      const btn = el('button', `tgl tgl-${c.color || 'yellow'}`, c.icon ? ICONS[c.icon] : `<span>${c.label}</span>`);
      btn.setAttribute('aria-label', c.label);
      wrap.append(led, btn);
      if (c.icon) wrap.append(el('div', 'ctl-label', c.label));
      const render = () => {
        const on = !!S.params[c.id];
        wrap.classList.toggle('on', on);
        btn.setAttribute('aria-pressed', on);
      };
      btn.addEventListener('click', () => {
        if (commentMode) return;
        const next = S.params[c.id] ? 0 : 1;
        // ML and G-ML are two flavours of mono mode: only one can be on
        if (next && c.id === 'ml' && S.params.gml) setValue('gml', 0);
        if (next && c.id === 'gml' && S.params.ml) setValue('ml', 0);
        setValue(c.id, next);
      });
      return { node: wrap, render };
    },

    select(c) {
      const wrap = el('div', 'ctl ctl-select');
      const lcd = el('button', 'lcd');
      lcd.setAttribute('aria-label', c.label);
      wrap.append(lcd, el('div', 'ctl-label', c.label));
      const render = () => { lcd.textContent = c.options[S.params[c.id]]; };
      lcd.addEventListener('click', () => {
        if (!commentMode) setValue(c.id, (S.params[c.id] + 1) % c.options.length);
      });
      lcd.addEventListener('contextmenu', e => {
        e.preventDefault();
        if (!commentMode) setValue(c.id, (S.params[c.id] - 1 + c.options.length) % c.options.length);
      });
      lcd.title = 'Click: next · Right-click: previous';
      return { node: wrap, render };
    },

    stepper(c) {
      const wrap = el('div', 'ctl ctl-stepper');
      const box = el('div', 'stepper');
      const minus = el('button', 'step-btn', '−');
      const lcd = el('div', 'lcd lcd-num');
      const plus = el('button', 'step-btn', '+');
      box.append(minus, lcd, plus);
      wrap.append(box, el('div', 'ctl-label', c.label));
      const render = () => { lcd.textContent = S.params[c.id]; };
      minus.addEventListener('click', () => { if (!commentMode) setValue(c.id, clamp(S.params[c.id] - 1, c.min, c.max)); });
      plus.addEventListener('click', () => { if (!commentMode) setValue(c.id, clamp(S.params[c.id] + 1, c.min, c.max)); });
      return { node: wrap, render };
    },

    button(c) {
      const wrap = el('div', 'ctl ctl-button');
      const btn = el('button', 'momentary', c.label);
      wrap.append(el('span', 'led led-red'), btn);
      btn.addEventListener('click', () => {
        if (commentMode) return;
        S.panic();
        if (window.Arp) Arp.stopAll();
        wrap.classList.add('on');
        setTimeout(() => wrap.classList.remove('on'), 250);
      });
      return { node: wrap, render: () => {} };
    },

    tempo(c) {
      const wrap = el('div', 'ctl ctl-tempo');
      const box = el('div', 'stepper');
      const lcd = el('div', 'lcd lcd-num tempo-lcd');
      lcd.tabIndex = 0;
      lcd.setAttribute('role', 'slider');
      lcd.setAttribute('aria-label', c.label);
      lcd.title = 'Drag up/down or scroll. Double-click: 120';
      const tap = el('button', 'step-btn tap-btn', 'Tap');
      box.append(lcd, tap);
      wrap.append(box, el('div', 'ctl-label', c.label));
      const render = () => { lcd.textContent = Math.round(S.params[c.id]); lcd.setAttribute('aria-valuenow', S.params[c.id]); };
      dragInput(lcd, () => S.params[c.id], v => setValue(c.id, Math.round(v)), { range: 300, min: c.min, max: c.max });
      lcd.addEventListener('dblclick', () => setValue(c.id, defaults[c.id]));
      let taps = [];
      tap.addEventListener('click', () => {
        if (commentMode) return;
        const now = performance.now();
        if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
        taps.push(now);
        taps = taps.slice(-5);
        if (taps.length >= 2) {
          const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
          setValue(c.id, clamp(Math.round(60000 / avg), c.min, c.max));
        }
      });
      return { node: wrap, render };
    },

    wheel(c) {
      const wrap = el('div', 'ctl ctl-wheel');
      const wheel = el('div', 'wheel');
      wheel.innerHTML = '<div class="wheel-center"></div><div class="wheel-thumb"></div>';
      wheel.setAttribute('role', 'slider');
      wheel.setAttribute('aria-label', c.label);
      const readout = el('div', 'readout');
      wrap.append(wheel, el('div', 'ctl-label', c.label), readout);
      const render = () => {
        wheel.style.setProperty('--v', S.params[c.id]);
        readout.textContent = S.format(c.id, S.params[c.id]);
      };
      wheel.addEventListener('pointerdown', e => {
        if (commentMode) return;
        e.preventDefault();
        wheel.setPointerCapture(e.pointerId);
        wheel.classList.add('active');
        const r = wheel.getBoundingClientRect();
        const at = ev => setValue(c.id, clamp(((ev.clientX - r.left) / r.width) * 2 - 1, -1, 1));
        at(e);
        const up = () => {
          wheel.classList.remove('active');
          wheel.removeEventListener('pointermove', at);
          wheel.removeEventListener('pointerup', up);
          wheel.removeEventListener('pointercancel', up);
          setValue(c.id, 0); // spring back to centre
        };
        wheel.addEventListener('pointermove', at);
        wheel.addEventListener('pointerup', up);
        wheel.addEventListener('pointercancel', up);
      });
      return { node: wrap, render };
    },
  };

  // ---------- render rack ----------
  const rack = $('#rack');
  const arpRack = $('#arp-rack');
  const mainEl = document.querySelector('main');
  let notesReady = false;

  // Arp needs a few helpers from here; init before its pattern editor is drawn
  window.Arp.init({
    el, store, toast, setValue,
    isCommenting: () => commentMode,
    flashKey: (note, dur) => flashKey(note, dur),
    setHandle: (text, lit, rec) => setArpHandle(text, lit, rec),
    registerTarget: (id, label, sectionTitle) => { controlIndex[id] = { def: { label }, section: { title: sectionTitle }, render() {} }; },
    refreshNotes: () => { if (notesReady) renderNotes(); },
  });

  // Width share of a section = sum of how much room its controls need
  const W = { slider: 1, knob: 1.3, wheel: 2.6, toggle: 0.9, switch: 0.9, select: 1, stepper: 1.3, button: 1, tempo: 1.8 };

  function renderRow(rowId, container) {
    const row = el('div', 'rack-row');
    window.PANEL.filter(s => s.row === rowId).forEach(s => {
      const sec = el('section', `module accent-${s.accent}`);
      sec.dataset.cid = s.id;
      sec.style.setProperty('--weight', s.custom ? 40 : s.controls.reduce((sum, c) => sum + (c.group ? W[c.type] * 0.7 : W[c.type]), 0).toFixed(1));
      const head = el('header', 'module-head', `<h3>${s.title}</h3>`);
      head.dataset.cid = s.id;
      const body = el('div', 'module-body');
      if (s.custom === 'pattern') window.Arp.renderPattern(body);
      if (s.graph) {
        const names = { wave: 'Waveform', lfo: 'LFO shape', filter: 'Filter curve', env: 'Envelope' };
        const scr = window.Viz.create(s.graph, names[s.graph]);
        scr.dataset.cid = s.id + 'Graph';
        controlIndex[s.id + 'Graph'] = { def: { label: names[s.graph] + ' graph' }, section: s, render() {} };
        body.append(scr);
      }
      let groupBox = null;
      s.controls.forEach(c => {
        const built = builders[c.type](c);
        built.node.dataset.cid = c.id;
        controlIndex[c.id] = { def: c, section: s, ...built };
        if (c.group) {
          if (!groupBox || groupBox.dataset.group !== c.group) {
            groupBox = el('div', 'ctl-group');
            groupBox.dataset.group = c.group;
            body.append(groupBox);
          }
          groupBox.append(built.node);
        } else {
          groupBox = null;
          body.append(built.node);
        }
        built.render();
      });
      sec.append(head, body);
      row.append(sec);
    });
    container.append(row);
  }
  renderRow(1, rack);
  renderRow(2, rack);
  renderRow('arp1', arpRack);
  renderRow('arp2', arpRack);

  // Section headers are commentable too
  window.PANEL.forEach(s => { controlIndex[s.id] = { def: { label: s.title }, section: null, render() {} }; });

  // Push saved values into the engine (it starts at panel defaults)
  Object.keys(defaults).forEach(id => S.setParam(id, S.params[id]));

  // ---------- keyboard ----------
  const kb = $('#keyboard');
  const KEYMAP = 'awsedftgyhujkolp;'.split(''); // C..E (17 semitones)
  let octave = 0;
  const pressed = new Map(); // note -> key element
  const BLACK = [1, 3, 6, 8, 10];

  function buildKeyboard() {
    kb.innerHTML = '';
    const whiteCount = clamp(Math.floor(kb.clientWidth / 44), 10, 36);
    const startNote = 48 + octave * 12; // C3
    let n = startNote, whites = 0;
    while (whites < whiteCount) {
      const isBlack = BLACK.includes(n % 12);
      const key = el('div', isBlack ? 'key black' : 'key white');
      key.dataset.note = n;
      if (!isBlack) {
        whites++;
        if (n % 12 === 0) key.append(el('span', 'key-label', 'C' + (Math.floor(n / 12) - 1)));
      }
      kb.append(key);
      n++;
    }
    // drop a trailing black key so the keyboard ends on a white key
    if (kb.lastChild && kb.lastChild.classList.contains('black')) kb.lastChild.remove();
    pressed.forEach((_, note) => markKey(note, true));
  }

  function markKey(note, on) {
    const k = kb.querySelector(`[data-note="${note}"]`);
    if (k) k.classList.toggle('down', on);
  }
  // Keys go to the arpeggiator first; it decides whether they sound directly
  const play = (note, vel) => {
    if (pressed.has(note)) return;
    pressed.set(note, true); markKey(note, true);
    if (!Arp.keyDown(note, vel)) S.noteOn(note, vel);
    updateAudioStatus();
  };
  const stop = note => {
    if (!pressed.has(note)) return;
    pressed.delete(note); markKey(note, false);
    if (!Arp.keyUp(note)) S.noteOff(note);
  };

  // Light a key while the arpeggiator plays it
  const flashTimers = {};
  function flashKey(note, dur) {
    const k = kb.querySelector(`[data-note="${note}"]`);
    if (!k) return;
    k.classList.add('arp');
    clearTimeout(flashTimers[note]);
    flashTimers[note] = setTimeout(() => k.classList.remove('arp'), Math.max(60, dur * 1000));
  }

  // ---------- arpeggiator fold-out ----------
  const arpPanel = $('#arp-panel'), arpToggle = $('#arp-toggle');
  function openArp(open) {
    arpPanel.classList.toggle('open', open);
    arpPanel.inert = !open;
    arpToggle.setAttribute('aria-expanded', open);
    store.set('juno-arp-open-v1', open);
  }
  arpToggle.addEventListener('click', () => { if (!commentMode) openArp(!arpPanel.classList.contains('open')); });
  function setArpHandle(text, lit, rec) {
    // queried here because Arp.init() calls this before the consts below exist
    const handle = $('#arp-toggle');
    $('#arp-handle-state').textContent = text;
    handle.classList.toggle('lit', lit);
    handle.classList.toggle('rec', !!rec);
  }

  let mouseNote = null;
  kb.addEventListener('pointerdown', e => {
    const k = e.target.closest('.key');
    if (!k || commentMode) return;
    e.preventDefault();
    const r = k.getBoundingClientRect();
    const vel = clamp(0.3 + 0.7 * (e.clientY - r.top) / r.height, 0.1, 1);
    mouseNote = +k.dataset.note;
    play(mouseNote, vel);
  });
  kb.addEventListener('pointerover', e => {
    if (mouseNote == null || !(e.buttons & 1)) return;
    const k = e.target.closest('.key');
    if (!k || +k.dataset.note === mouseNote) return;
    stop(mouseNote); mouseNote = +k.dataset.note; play(mouseNote, 0.8);
  });
  window.addEventListener('pointerup', () => { if (mouseNote != null) { stop(mouseNote); mouseNote = null; } });

  const typing = e => /INPUT|TEXTAREA/.test(e.target.tagName);
  window.addEventListener('keydown', e => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape' && commentMode) { setCommentMode(false); return; }
    const k = e.key.toLowerCase();
    if (k === 'z') { shiftOctave(-1); return; }
    if (k === 'x') { shiftOctave(1); return; }
    const i = KEYMAP.indexOf(k);
    if (i >= 0 && !e.repeat) play(60 + octave * 12 + i, 0.8);
  });
  window.addEventListener('keyup', e => {
    const i = KEYMAP.indexOf(e.key.toLowerCase());
    if (i >= 0) stop(60 + octave * 12 + i);
  });
  window.addEventListener('blur', () => { [...pressed.keys()].forEach(stop); });

  function shiftOctave(d) {
    const next = clamp(octave + d, -3, 3);
    if (next === octave) return;
    [...pressed.keys()].forEach(stop);
    octave = next;
    $('#oct-value').textContent = (octave > 0 ? '+' : '') + octave;
    buildKeyboard();
  }
  $('#oct-down').addEventListener('click', () => shiftOctave(-1));
  $('#oct-up').addEventListener('click', () => shiftOctave(1));
  new ResizeObserver(() => buildKeyboard()).observe(kb);

  // ---------- presets ----------
  const savedPreset = store.get('juno-preset-v1', null);
  currentPreset = savedPreset ? window.PRESETS.find(p => p.num === savedPreset.num) || null : null;
  presetEdited = !!(savedPreset && savedPreset.edited);
  let presetCat = 'All', presetQuery = '';

  renderPresetBar = function () {
    $('#preset-num').textContent = currentPreset ? String(currentPreset.num).padStart(3, '0') : '---';
    $('#preset-label').textContent = currentPreset ? currentPreset.name + (presetEdited ? ' *' : '') : 'Your patch';
    $('#preset-meta').textContent = currentPreset ? `${currentPreset.cat} · ${currentPreset.genre}` : '';
    $('#preset-open').title = presetEdited ? 'Edited since loading (*). Open the preset library' : 'Open the preset library';
    store.set('juno-preset-v1', currentPreset ? { num: currentPreset.num, edited: presetEdited } : null);
    document.querySelectorAll('.preset-row').forEach(r => r.classList.toggle('active', currentPreset && +r.dataset.num === currentPreset.num));
  };

  function loadPreset(p) {
    presetLoading = true;
    Object.entries(p.values).forEach(([id, v]) => { if (controlIndex[id]) setValue(id, v); });
    presetLoading = false;
    currentPreset = p; presetEdited = false;
    renderPresetBar();
  }

  const presetMatches = () => window.PRESETS.filter(p =>
    (presetCat === 'All' || p.cat === presetCat) &&
    (!presetQuery || `${p.name} ${p.cat} ${p.genre}`.toLowerCase().includes(presetQuery)));

  function stepPreset(d) {
    const list = presetMatches().length ? presetMatches() : window.PRESETS;
    const i = currentPreset ? list.findIndex(p => p.num === currentPreset.num) : -1;
    loadPreset(list[(i + d + list.length) % list.length]);
    toast(`${String(currentPreset.num).padStart(3, '0')} ${currentPreset.name}`);
  }

  function renderPresetList() {
    const cats = $('#preset-cats');
    cats.innerHTML = '';
    ['All', ...window.PRESET_CATEGORIES].forEach(c => {
      const n = c === 'All' ? window.PRESETS.length : window.PRESETS.filter(p => p.cat === c).length;
      const b = el('button', 'preset-cat', `${c} <span>${n}</span>`);
      b.setAttribute('aria-pressed', c === presetCat);
      b.addEventListener('click', () => { presetCat = c; renderPresetList(); });
      cats.append(b);
    });
    const list = $('#preset-list');
    list.innerHTML = '';
    const items = presetMatches();
    if (!items.length) list.innerHTML = '<li class="empty">No preset matches. Try another word or category.</li>';
    items.forEach(p => {
      const li = el('li', 'preset-row');
      li.dataset.num = p.num;
      li.innerHTML = `<button><span class="preset-num">${String(p.num).padStart(3, '0')}</span><span class="preset-row-name">${p.name}</span><span class="preset-row-meta">${p.cat} · ${p.genre}</span></button>`;
      li.querySelector('button').addEventListener('click', () => loadPreset(p));
      list.append(li);
    });
    renderPresetBar();
  }

  const presetDrawer = $('#preset-drawer');
  const openPresets = on => {
    presetDrawer.classList.toggle('open', on);
    presetDrawer.setAttribute('aria-hidden', !on);
    if (on) { renderPresetList(); const a = presetDrawer.querySelector('.preset-row.active'); if (a) a.scrollIntoView({ block: 'center' }); }
  };
  $('#preset-open').addEventListener('click', () => openPresets(!presetDrawer.classList.contains('open')));
  $('#preset-close').addEventListener('click', () => openPresets(false));
  $('#preset-prev').addEventListener('click', () => stepPreset(-1));
  $('#preset-next').addEventListener('click', () => stepPreset(1));
  $('#preset-search').addEventListener('input', e => { presetQuery = e.target.value.trim().toLowerCase(); renderPresetList(); });
  renderPresetBar();

  // ---------- skins ----------
  // A skin is a set of colour tokens in styles.css under [data-skin="..."]
  function setSkin(name) {
    document.documentElement.dataset.skin = name;
    document.querySelectorAll('.skin-btn').forEach(b => b.setAttribute('aria-pressed', b.dataset.skin === name));
    store.set('juno-skin-v1', name);
    if (window.Viz) Viz.update();
  }
  document.querySelectorAll('.skin-btn').forEach(b => b.addEventListener('click', () => setSkin(b.dataset.skin)));
  setSkin(document.documentElement.dataset.skin || 'studio');

  // ---------- audio status ----------
  function updateAudioStatus() {
    const st = S.state(), pill = $('#audio-status');
    const on = st === 'running';
    pill.textContent = on ? 'Audio on' : st === 'loading' ? 'Loading sound…' : 'Audio off · click anywhere';
    pill.classList.toggle('pill-live', on);
    pill.classList.toggle('pill-muted', !on);
  }
  const unlock = () => { S.start(); setTimeout(updateAudioStatus, 100); };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('juno-ready', updateAudioStatus);
  window.addEventListener('keydown', unlock, { once: true });

  // ---------- comment mode ----------
  let notes = store.get('juno-notes-v1', []);
  const saveNotes = () => { store.set('juno-notes-v1', notes); renderNotes(); };
  const labelFor = id => {
    const c = controlIndex[id];
    if (!c) return id;
    return c.section ? `${c.section.title} › ${c.def.label}` : `${c.def.label} section`;
  };
  const valueFor = id => {
    const c = controlIndex[id];
    if (!c || !c.section || !('value' in c.def)) return null;
    const v = S.params[id], d = c.def;
    if (d.options) return d.options[v];
    if (d.type === 'toggle') return v ? 'on' : 'off';
    if (d.type === 'stepper') return String(v);
    if (d.type === 'tempo') return Math.round(v) + ' BPM';
    if (d.id === 'volume') return Math.round(v * 100) + ' %';
    return S.format(id, v);
  };

  function setCommentMode(on) {
    commentMode = on;
    document.body.classList.toggle('commenting', on);
    $('#btn-comment').setAttribute('aria-pressed', on);
    if (!on) closePopover();
    if (on) toast('Comment mode: click any control or section header. Esc to exit.');
  }
  $('#btn-comment').addEventListener('click', () => setCommentMode(!commentMode));

  // Capture clicks before the controls see them
  [rack, arpRack].forEach(container => container.addEventListener('click', e => {
    if (!commentMode) return;
    const target = e.target.closest('[data-cid]');
    if (!target) return;
    e.preventDefault(); e.stopPropagation();
    openPopover(target.dataset.cid, target);
  }, true));

  const pop = $('#popover');
  let popTarget = null, editId = null;
  function openPopover(cid, anchor, existing) {
    popTarget = cid; editId = existing ? existing.id : null;
    const val = valueFor(cid);
    $('#popover-title').innerHTML = `<b>${labelFor(cid)}</b>${val ? ` <span class="muted">· now ${val}</span>` : ''}`;
    $('#popover-input').value = existing ? existing.text : '';
    pop.hidden = false;
    const r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = clamp(r.left + r.width / 2 - pw / 2, 12, window.innerWidth - pw - 12);
    let top = r.bottom + 8;
    if (top + ph > window.innerHeight - 12) top = Math.max(12, r.top - ph - 8);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
    document.querySelectorAll('.comment-target').forEach(n => n.classList.remove('comment-target'));
    anchor.classList.add('comment-target');
    $('#popover-input').focus();
  }
  function closePopover() {
    pop.hidden = true; popTarget = null; editId = null;
    document.querySelectorAll('.comment-target').forEach(n => n.classList.remove('comment-target'));
  }
  function savePopover() {
    const text = $('#popover-input').value.trim();
    if (!text) { closePopover(); return; }
    if (editId) {
      const n = notes.find(x => x.id === editId);
      if (n) { n.text = text; n.updated = new Date().toISOString(); }
    } else {
      notes.push({ id: Date.now().toString(36), target: popTarget, label: labelFor(popTarget), value: valueFor(popTarget), text, created: new Date().toISOString() });
    }
    saveNotes(); closePopover(); toast('Note saved');
  }
  $('#popover-save').addEventListener('click', savePopover);
  $('#popover-cancel').addEventListener('click', closePopover);
  $('#popover-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) savePopover();
    if (e.key === 'Escape') closePopover();
  });

  // ---------- notes drawer ----------
  const drawer = $('#drawer');
  const openDrawer = on => { drawer.classList.toggle('open', on); drawer.setAttribute('aria-hidden', !on); };
  $('#btn-notes').addEventListener('click', () => openDrawer(!drawer.classList.contains('open')));
  $('#drawer-close').addEventListener('click', () => openDrawer(false));

  $('#general-add').addEventListener('click', () => {
    const text = $('#general-input').value.trim();
    if (!text) return;
    notes.push({ id: Date.now().toString(36), target: null, label: 'General', value: null, text, created: new Date().toISOString() });
    $('#general-input').value = '';
    saveNotes();
  });

  function esc(s) { return s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }

  function renderNotes() {
    $('#notes-count').textContent = notes.length;
    document.querySelectorAll('.has-note').forEach(n => n.classList.remove('has-note'));
    notes.forEach(n => {
      if (!n.target) return;
      const node = mainEl.querySelector(`[data-cid="${n.target}"]`);
      if (node) node.classList.add('has-note');
    });
    const list = $('#notes-list');
    list.innerHTML = notes.length ? '' : '<li class="empty">No notes yet.</li>';
    notes.slice().reverse().forEach(n => {
      const li = el('li', 'note');
      li.innerHTML = `<div class="note-head"><b>${esc(n.label)}</b>${n.value ? `<span class="muted">${esc(n.value)}</span>` : ''}</div>
        <div class="note-text">${esc(n.text)}</div>
        <div class="note-actions"><button data-act="edit">Edit</button><button data-act="del">Delete</button></div>`;
      li.querySelector('[data-act="del"]').addEventListener('click', () => { notes = notes.filter(x => x.id !== n.id); saveNotes(); });
      li.querySelector('[data-act="edit"]').addEventListener('click', () => {
        if (!n.target) {
          const t = prompt('Edit note', n.text);
          if (t != null && t.trim()) { n.text = t.trim(); saveNotes(); }
          return;
        }
        const anchor = mainEl.querySelector(`[data-cid="${n.target}"]`);
        if (anchor) { openDrawer(false); anchor.scrollIntoView({ block: 'center' }); openPopover(n.target, anchor, n); }
      });
      li.addEventListener('mouseenter', () => { const a = n.target && mainEl.querySelector(`[data-cid="${n.target}"]`); if (a) a.classList.add('note-hover'); });
      li.addEventListener('mouseleave', () => document.querySelectorAll('.note-hover').forEach(x => x.classList.remove('note-hover')));
      list.append(li);
    });
  }

  function toMarkdown() {
    const lines = ['# Juno UI notes', '', `Exported: ${new Date().toLocaleString()}`, `Skin: ${document.documentElement.dataset.skin}`, '', '## Notes', ''];
    if (!notes.length) lines.push('_No notes._');
    notes.forEach(n => {
      lines.push(`- **${n.label}**${n.value ? ` (was ${n.value})` : ''}: ${n.text.replace(/\n+/g, ' ')}`);
    });
    lines.push('', '## Patch at export', '', '| Section | Control | Value |', '|---|---|---|');
    window.PANEL.forEach(s => s.controls.forEach(c => {
      if ('value' in c && c.type !== 'wheel') lines.push(`| ${s.title} | ${c.label} | ${valueFor(c.id)} |`);
    }));
    return lines.join('\n') + '\n';
  }

  let fileHandle = null; // remembered after the first save (Chrome / Edge)
  $('#notes-save').addEventListener('click', async () => {
    const md = toMarkdown();
    if (window.showSaveFilePicker) {
      try {
        if (!fileHandle) {
          fileHandle = await window.showSaveFilePicker({
            suggestedName: 'juno-notes.md',
            types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
          });
        }
        const w = await fileHandle.createWritable();
        await w.write(md); await w.close();
        toast(`Saved to ${fileHandle.name}`);
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
        fileHandle = null; // fall back to a download
      }
    }
    const a = el('a');
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    a.download = 'juno-notes.md';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Downloaded juno-notes.md. Move it to Juno/notes/');
  });
  $('#notes-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(toMarkdown()); toast('Copied. Paste it into the chat with Claude.'); }
    catch (e) { toast('Copy failed. Use "Save notes file" instead.'); }
  });
  $('#notes-clear').addEventListener('click', () => {
    if (notes.length && confirm('Delete all notes?')) { notes = []; saveNotes(); }
  });

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  notesReady = true;
  renderNotes();
  updateAudioStatus();
  openArp(store.get('juno-arp-open-v1', false));
  // live scope in the arpeggiator bar
  $('#arp-toggle').insertBefore(Viz.create('scope', ''), $('#arp-toggle .arp-chevron'));
  Viz.init();
  Arp.updateHandle();
})();
