// Checks that the plugin and the web version agree.
//
//   node plugin/tools/check.mjs
//
// 1. Mappings: the C++ copy of dspValues() (plugin/Source/Mappings.h) against
//    the one in synth.js, on 500 random panel settings.
// 2. Sound: the plugin engine (C++) against the web engine (faustwasm, the
//    same code the browser runs), note for note, on a few test sequences.
//
// Needs Node.js, CMake, a C++ compiler, and `npm install` in dsp/.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
let failed = false;
const fail = msg => { console.log('  FAIL ' + msg); failed = true; };

// ---------- build the check tool ----------
const buildDir = path.join(here, 'build');
execFileSync('cmake', ['-S', here, '-B', buildDir, '-DCMAKE_BUILD_TYPE=Release'], { stdio: 'ignore' });
execFileSync('cmake', ['--build', buildDir, '--config', 'Release'], { stdio: 'inherit' });
const exe = [path.join(buildDir, 'halden6_check'), path.join(buildDir, 'Release', 'halden6_check.exe'), path.join(buildDir, 'halden6_check.exe')]
  .find(f => fs.existsSync(f));
const tool = (args, input) => execFileSync(exe, args, { input, maxBuffer: 1 << 28 }).toString();

// ---------- the web side: panel.js and synth.js with a stub window ----------
const web = { window: {} };
web.window.window = web.window;
vm.runInNewContext(fs.readFileSync(path.join(root, 'panel.js'), 'utf8'), web);
vm.runInNewContext(fs.readFileSync(path.join(root, 'mapping.js'), 'utf8'), web);
vm.runInNewContext(fs.readFileSync(path.join(root, 'synth.js'), 'utf8'), web);
const Synth = web.window.Synth;

// Parameter order and types from the generated header
const header = fs.readFileSync(path.join(here, '..', 'Source', 'generated', 'Parameters.h'), 'utf8');
const params = [...header.matchAll(/\{ "(\w+)", ".*?", ParamType::(\w+), (-?[\d.]+)f, (-?[\d.]+)f, (-?[\d.]+)f,/g)]
  .map(m => ({ id: m[1], type: m[2], min: +m[3], max: +m[4], def: +m[5] }));

const defaults = () => Object.fromEntries(params.map(p => [p.id, p.def]));
function randomPanel() {
  const v = {};
  for (const p of params) {
    const r = Math.random();
    v[p.id] = p.type === 'Float' ? p.min + r * (p.max - p.min) : Math.min(p.max, p.min + Math.floor(r * (p.max - p.min + 1)));
  }
  return v;
}
// One line for the C++ tool: parameters in header order, then pitchWheel, bpm
const panelLine = (v, wheel = 0, bpm = 120) => params.map(p => Math.fround(v[p.id])).concat([Math.fround(wheel), bpm]).join(' ');
// The same panel as synth.js sees it (with float32 values, as the plugin stores them)
function webValues(v, wheel = 0, bpm = 120) {
  for (const p of params) Synth.params[p.id] = Math.fround(v[p.id]);
  Synth.params.pitchWheel = Math.fround(wheel);
  Synth.params.bpm = bpm;
  return Synth.dspValues();
}

// ---------- 1. mappings ----------
console.log('Mappings (JavaScript vs C++)');
{
  const cases = Array.from({ length: 500 }, (_, i) => ({ v: i === 0 ? defaults() : randomPanel(), wheel: Math.random() * 2 - 1, bpm: 40 + Math.random() * 200 }));
  const lines = tool(['map'], cases.map(c => panelLine(c.v, c.wheel, c.bpm)).join('\n') + '\n').trim().split('\n');
  const names = lines[0].split(' ');
  let worst = 0, worstName = '';
  cases.forEach((c, i) => {
    const js = webValues(c.v, c.wheel, c.bpm);
    const cpp = lines[i + 1].split(' ').map(Number);
    names.forEach((n, k) => {
      if (!(n in js)) return fail(`${n} exists in C++ but not in synth.js`);
      const err = Math.abs(js[n] - cpp[k]) / Math.max(1, Math.abs(js[n]));
      if (err > worst) { worst = err; worstName = n; }
    });
    for (const n in js) if (!names.includes(n)) fail(`${n} exists in synth.js but not in C++`);
  });
  if (worst > 1e-9) fail(`largest difference ${worst.toExponential(2)} in ${worstName}`);
  else console.log(`  ok: ${cases.length} panels, ${names.length} values each, largest relative difference ${worst.toExponential(1)}`);
}

// ---------- 2. sound ----------
console.log('Sound (web engine vs plugin engine, 48 kHz)');
{
  globalThis.window = globalThis;
  vm.runInThisContext(fs.readFileSync(path.join(root, 'vendor', 'faustwasm.js'), 'utf8'));
  vm.runInThisContext(fs.readFileSync(path.join(root, 'dsp', 'halden6-dsp.js'), 'utf8'));
  const D = globalThis.HALDEN_DSP;
  const bytes = b64 => Uint8Array.from(Buffer.from(b64, 'base64'));
  const [dspM, mixM, effM] = await Promise.all([D.dsp, D.mixer, D.effect].map(b => WebAssembly.compile(bytes(b))));
  const log = console.log;
  const sr = 48000, block = 128;

  async function renderWeb(v, events, frames) {
    const gen = new globalThis.FaustWasm.FaustPolyDspGenerator();
    const p = await gen.createOfflineProcessor(sr, block, 6,
      { module: dspM, json: JSON.stringify(D.meta), soundfiles: {} }, mixM,
      { module: effM, json: JSON.stringify(D.effectMeta), soundfiles: {} });
    const vals = webValues(v);
    for (const k in vals) p.setParamValue('/halden6/' + k, vals[k]);
    const L = new Float32Array(frames), R = new Float32Array(frames);
    let i = 0;
    console.log = () => {};   // faustwasm logs every voice steal
    for (let f = 0; f < frames; f += block) {
      while (i < events.length && events[i].frame <= f) {
        const e = events[i++];
        e.on ? p.keyOn(0, e.note, Math.max(1, Math.round(e.vel * 127))) : p.keyOff(0, e.note, 0);
      }
      const out = p.render([], block);
      L.set(out[0], f); R.set(out[1], f);
    }
    console.log = log;
    return [L, R];
  }

  function renderPlugin(v, events, frames) {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'halden6-')), 'out.raw');
    tool(['render', String(sr), String(frames), file],
      panelLine(v) + '\n' + events.map(e => `${e.frame} ${e.on ? "on" : "off"} ${e.note} ${e.vel ?? 0}`).join('\n') + '\n');
    const buf = fs.readFileSync(file);
    const all = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
    return [all.slice(0, frames), all.slice(frames)];
  }

  // Events land on 128-frame block starts, where the web engine applies them
  const seq = (list, step = 0.25, len = 0.2) => list.flatMap((n, k) => [
    { frame: Math.round((0.05 + k * step) * sr / block) * block, on: true, note: n, vel: 0.5 + (k % 4) / 8 },
    { frame: Math.round((0.05 + k * step + len) * sr / block) * block, on: false, note: n },
  ]).sort((a, b) => a.frame - b.frame);
  const chord = (notes, len) => notes.flatMap(n => [{ frame: 2304, on: true, note: n, vel: 0.8 }, { frame: 2304 + Math.round(len * sr / block) * block, on: false, note: n }]);

  const scenarios = [
    ['Default patch, melody', defaults(), seq([60, 62, 64, 65, 67, 69, 71, 72])],
    ['Default patch, 6-note chord into the limiter', { ...defaults(), volume: 1, vcaLevel: 1 }, chord([36, 43, 48, 55, 60, 64], 1.5)],
    ['PWM pad, chorus I+II, LFO, slow attack', { ...defaults(), dcoPulse: 1, dcoSub: 1, dcoPwm: 0.6, chorus2: 1, dcoLfo: 0.3, vcfLfo: 0.3, lfoDelay: 0.2, envA: 0.6, envR: 0.7, vcfRes: 0.5, hpfFreq: 0.3 }, chord([48, 55, 60, 63], 1.2)],
    ['Long release, 8 notes: voice stealing', { ...defaults(), envR: 0.8 }, seq([48, 52, 55, 59, 62, 65, 69, 72], 0.15, 0.1)],
    ['Gate VCA, noise, velocity, negative env', { ...defaults(), vcaMode: 1, dcoNoise: 0.4, velocityEnv: 1, vcfEnvPolarity: 1, vcfEnv: 0.6, vcfKybd: 1 }, seq([40, 52, 64, 76, 88], 0.2, 0.1)],
  ];

  for (const [name, v, events] of scenarios) {
    const frames = Math.round(2.5 * sr / block) * block;
    const web = await renderWeb(v, events, frames);
    const cpp = renderPlugin(v, events, frames);
    let sig = 0, err = 0, maxDiff = 0, peak = 0;
    for (let c = 0; c < 2; c++) for (let i = 0; i < frames; i++) {
      const d = web[c][i] - cpp[c][i];
      sig += web[c][i] ** 2; err += d * d;
      maxDiff = Math.max(maxDiff, Math.abs(d)); peak = Math.max(peak, Math.abs(cpp[c][i]));
    }
    const snr = 10 * Math.log10(sig / Math.max(err, 1e-30));
    const line = `${name}: difference ${snr.toFixed(0)} dB below the signal, largest sample difference ${maxDiff.toExponential(1)}, plugin peak ${peak.toFixed(3)}`;
    if (sig === 0) fail(name + ': web engine was silent');
    else if (snr < 60 || peak > 1) fail(line);
    else console.log('  ok: ' + line);
  }
}

process.exit(failed ? 1 : 0);
