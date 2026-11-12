// MIDI keyboards and controllers (Web MIDI), for the web version.
//
// - Notes from every connected MIDI input play the synth, through the same
//   path as the on-screen keys (so the arpeggiator takes them when it is on).
//   Pitch bend moves the pitch wheel.
// - MIDI learn: click "MIDI learn", click a knob or fader, then move a knob or
//   fader on your controller. From then on that hardware control moves it.
//   Click a mapped control again while learning to remove its mapping.
//   Mappings are kept in this browser.
//
// Web MIDI needs Chrome, Edge, Opera or Firefox, on desktop or Android.
// Safari (and so every browser on iPhone and iPad) has no Web MIDI.
// In the plugin this file stays idle: the DAW sends the MIDI, and the DAW's
// own MIDI mapping (in Ableton Live: MIDI Map mode) maps every parameter.

(function () {
  const S = window.Synth, UI = window.UI;
  const btn = document.querySelector('#btn-midi');
  if (!btn || !UI) return;
  if (S.isPlugin || !navigator.requestMIDIAccess) { btn.hidden = true; return; }
  btn.hidden = false;

  const MAPPABLE = new Set(['slider', 'knob']);
  const KEY = 'halden6-midi-map-v1';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(map)); } catch (e) {} };
  let map = load();                 // "channel:cc" -> control id
  let access = null, learning = false, target = null;

  const label = k => { const [ch, cc] = k.split(':'); return `CC ${cc}` + (ch !== '0' ? ` ch ${+ch + 1}` : ''); };
  const keyOf = id => Object.keys(map).find(k => map[k] === id);

  // ---------- incoming messages ----------
  function onMessage(e) {
    const [status, d1 = 0, d2 = 0] = e.data;
    const type = status & 0xf0, ch = status & 0x0f;
    if (type === 0x90 && d2 > 0) UI.keyDown(d1, d2 / 127);
    else if (type === 0x80 || (type === 0x90 && d2 === 0)) UI.keyUp(d1);
    else if (type === 0xe0) { const b = (d2 << 7 | d1) - 8192; UI.setValue('pitchWheel', b / (b > 0 ? 8191 : 8192)); }
    else if (type === 0xb0 && d1 < 120) onControl(`${ch}:${d1}`, d2);
    else if (type === 0xb0 && (d1 === 120 || d1 === 123)) S.panic();
  }

  function onControl(k, value) {
    if (learning && target) {
      // one hardware control per panel control, and the other way round
      Object.keys(map).forEach(m => { if (map[m] === target) delete map[m]; });
      map[k] = target;
      save();
      UI.toast(`${UI.control(target).def.label} now follows ${label(k)}`);
      setTarget(null);
      renderBadges();
      return;
    }
    const id = map[k];
    if (!id || !UI.control(id)) return;
    const def = UI.control(id).def, min = def.bipolar ? -1 : 0;
    UI.setValue(id, min + (value / 127) * (1 - min));
  }

  // ---------- devices ----------
  function attach() {
    let n = 0;
    access.inputs.forEach(input => { input.onmidimessage = onMessage; n++; });
    btn.querySelector('.midi-state').textContent = n ? `${n} device${n > 1 ? 's' : ''}` : 'no device';
    btn.classList.toggle('on', n > 0);
  }

  async function connect(fromClick) {
    try {
      access = await navigator.requestMIDIAccess();
      access.onstatechange = attach;
      attach();
      if (fromClick && !access.inputs.size) UI.toast('No MIDI device found. Plug in your keyboard or controller; it connects by itself.');
      return true;
    } catch (e) {
      if (fromClick) UI.toast('MIDI was not allowed. Allow MIDI devices for this site in the browser settings.');
      return false;
    }
  }

  // ---------- MIDI learn ----------
  function setTarget(id) {
    document.querySelectorAll('.midi-target').forEach(n => n.classList.remove('midi-target'));
    target = id;
    if (id) UI.control(id).node.classList.add('midi-target');
  }

  function setLearning(on) {
    learning = on;
    document.body.classList.toggle('midi-learning', on);
    btn.setAttribute('aria-pressed', on);
    setTarget(null);
    renderBadges();
    if (on) UI.toast('MIDI learn: click a knob or fader, then move a control on your MIDI device. Click a mapped control again to remove its mapping. Click MIDI learn again to finish.');
  }

  // A small "CC 74" tag on each mapped control, shown while learning
  function renderBadges() {
    document.querySelectorAll('.midi-badge').forEach(n => n.remove());
    Object.keys(map).forEach(k => {
      const c = UI.control(map[k]);
      if (!c) return;
      const b = document.createElement('span');
      b.className = 'midi-badge';
      b.textContent = label(k);
      c.node.append(b);
    });
  }

  // While learning, a click picks a control instead of moving it
  document.addEventListener('pointerdown', e => {
    if (!learning) return;
    const node = e.target.closest('[data-cid]');
    const c = node && UI.control(node.dataset.cid);
    if (!c || !c.def || !MAPPABLE.has(c.def.type)) return;
    e.preventDefault();
    e.stopPropagation();
    const id = node.dataset.cid;
    if (id === target) setTarget(null);
    else if (keyOf(id)) {
      delete map[keyOf(id)];
      save();
      renderBadges();
      UI.toast(`${c.def.label}: MIDI mapping removed`);
    } else setTarget(id);
  }, true);

  btn.addEventListener('click', async () => {
    if (!access && !(await connect(true))) return;
    setLearning(!learning);
  });

  // Connect without asking again if the browser already allowed MIDI here
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'midi' }).then(p => { if (p.state === 'granted') connect(false); }).catch(() => {});
  }
})();
