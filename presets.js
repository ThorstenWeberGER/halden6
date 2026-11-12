// Factory sound presets: 100 patches across classic and modern styles.
// Each preset lists only what differs from INIT, in real units (Hz,
// seconds); toPanel() converts them to fader positions using the same
// curves as synth.js. Arpeggiator, tempo and master volume are not touched.
//
// Keys: saw pulse sub (on/off) subLvl noise pwm (0..1)
//       pwmMod (true = PWM moves) pwmSrc ('lfo'|'env')
//       rate (LFO Hz) delay (s) wave ('sin'|'tri'|'saw'|'sqr') retrig tempo (0..5)
//       vib (LFO to pitch, 0..1) cut (Hz) res env (0..1) inv (negative env)
//       flfo (LFO to filter, 0..1) kybd hpf (Hz) A D R (s) S (0..1)
//       gate (VCA gate mode) level ch (0 off, 1 I, 2 II, 3 I+II)
//       mono ('ml'|'gml') velo bend (semitones) voices
//       rev (reverb amount 0..1) revLen (reverb length 0..1) tex (texture) fm

(function () {
  const INIT = {
    saw: 1, pulse: 0, sub: 0, subLvl: 0.5, noise: 0, pwm: 0.3, pwmMod: false, pwmSrc: 'lfo',
    rate: 4, delay: 0, wave: 'sin', retrig: false, tempo: 0, vib: 0,
    cut: 3000, res: 0.1, env: 0.3, inv: false, flfo: 0, kybd: 0.5, hpf: 10,
    A: 0.003, D: 0.5, S: 0.7, R: 0.3, gate: false, level: 0.7, ch: 1,
    mono: '', velo: 0.3, bend: 2, voices: 6,
    rev: 0, revLen: 0.5, tex: 0, fm: 0,
  };

  const inv = (x, min, max) => Math.min(1, Math.max(0, Math.log(x / min) / Math.log(max / min)));
  const WAVES = { sin: 0, tri: 1, saw: 2, sqr: 3 };

  function toPanel(o) {
    const p = { ...INIT, ...o };
    return {
      dcoSaw: +!!p.saw, dcoPulse: +!!p.pulse, dcoSub: +!!p.sub, dcoSubLevel: p.subLvl, dcoNoise: p.noise,
      dcoPwm: p.pwm, dcoPwmMod: p.pwmMod ? 0 : 1, dcoPwmSource: p.pwmSrc === 'env' ? 1 : 0,
      lfoRate: inv(p.rate, 0.1, 20), lfoDelay: Math.min(1, p.delay / 3), lfoWave: WAVES[p.wave],
      lfoTrig: p.retrig ? 0 : 1, lfoTempo: p.tempo, dcoLfo: p.vib,
      vcfFreq: inv(p.cut, 30, 18000), vcfRes: p.res, vcfEnv: Math.abs(p.env), vcfEnvPolarity: p.inv ? 1 : 0,
      vcfLfo: p.flfo, vcfKybd: p.kybd, hpfFreq: p.hpf <= 10 ? 0 : inv(p.hpf, 10, 1500),
      envA: inv(p.A, 0.001, 3), envD: inv(p.D, 0.005, 10), envS: p.S, envR: inv(p.R, 0.005, 10),
      vcaMode: p.gate ? 1 : 0, vcaLevel: p.level,
      chorus1: +(p.ch === 1 || p.ch === 3), chorus2: +(p.ch === 2 || p.ch === 3),
      ml: +(p.mono === 'ml'), gml: +(p.mono === 'gml'),
      velocityEnv: p.velo, bendDco: Math.min(1, p.bend / 12), voices: p.voices,
      revMix: p.rev, revLength: p.revLen, texture: p.tex, fm: p.fm,
    };
  }

  // [name, category, genre, overrides]
  const LIST = [
    // ---------- Bass ----------
    ['Halden Sub Bass', 'Bass', 'Synthpop', { saw: 0, pulse: 1, pwm: 0, sub: 1, subLvl: 0.8, cut: 400, env: 0.25, D: 0.3, S: 0.6, R: 0.1, ch: 0, mono: 'ml', kybd: 0.3 }],
    ['Italo Octave Bass', 'Bass', 'Italo Disco', { sub: 1, cut: 600, res: 0.3, env: 0.45, D: 0.18, S: 0.2, R: 0.08, ch: 0 }],
    ['Hi-NRG Pluck Bass', 'Bass', 'Hi-NRG', { cut: 350, res: 0.35, env: 0.55, D: 0.14, S: 0.1, R: 0.06, ch: 0 }],
    ['Acid Squelch', 'Bass', 'Acid House', { cut: 250, res: 0.82, env: 0.6, D: 0.25, S: 0.05, R: 0.05, mono: 'gml', kybd: 0.3, ch: 0, velo: 0.6 }],
    ['Acid Square', 'Bass', 'Acid House', { saw: 0, pulse: 1, pwm: 0, cut: 300, res: 0.78, env: 0.5, D: 0.2, S: 0.1, R: 0.05, mono: 'ml', ch: 0 }],
    ['Deep House Bass', 'Bass', 'Deep House', { saw: 0, pulse: 1, pwm: 0.1, sub: 1, subLvl: 0.6, cut: 500, res: 0.15, env: 0.2, D: 0.35, S: 0.4, R: 0.12, ch: 0 }],
    ['Synthwave Drive Bass', 'Bass', 'Synthwave', { sub: 1, subLvl: 0.4, cut: 700, res: 0.25, env: 0.4, D: 0.2, S: 0.3, R: 0.1 }],
    ['Techno Rumble', 'Bass', 'Techno', { sub: 1, subLvl: 0.7, cut: 180, res: 0.4, env: 0.3, D: 0.5, S: 0.2, R: 0.2, hpf: 30, ch: 0 }],
    ['Electro Funk Bass', 'Bass', 'Electro', { saw: 0, pulse: 1, pwm: 0.25, cut: 450, res: 0.45, env: 0.55, D: 0.16, S: 0.15, R: 0.07, mono: 'ml', ch: 0, velo: 0.6 }],
    ['Rubber Bass', 'Bass', 'Funk', { cut: 300, res: 0.55, env: 0.45, A: 0.005, D: 0.22, S: 0.25, R: 0.1, mono: 'gml', ch: 0 }],
    ['Sine Sub 808', 'Bass', 'Trap', { saw: 0, sub: 1, subLvl: 1, cut: 200, res: 0, env: 0, D: 1.5, S: 0, R: 0.3, mono: 'gml', ch: 0 }],
    ['Lo-fi Warm Bass', 'Bass', 'Lo-fi Hip-Hop', { cut: 350, res: 0.05, env: 0.15, D: 0.6, S: 0.5, R: 0.2, vib: 0.1, rate: 5, delay: 0.3 }],
    ['Reese Bass', 'Bass', 'Drum & Bass', { pulse: 1, pwm: 0.4, pwmMod: true, rate: 0.3, cut: 600, res: 0.25, env: 0.1, D: 1, S: 1, R: 0.2, ch: 3, mono: 'ml' }],
    ['Wobble Bass', 'Bass', 'Dubstep', { sub: 1, cut: 250, res: 0.5, env: 0, flfo: 0.8, wave: 'tri', tempo: 4, retrig: true, S: 1, R: 0.1, mono: 'ml', ch: 0 }],
    ['Disco Octave Bass', 'Bass', 'Disco', { saw: 0, pulse: 1, pwm: 0.2, cut: 800, res: 0.2, env: 0.35, D: 0.15, S: 0.3, R: 0.1 }],
    ['Dub Bass', 'Bass', 'Reggae / Dub', { saw: 0, pulse: 1, pwm: 0, sub: 1, subLvl: 0.6, cut: 300, env: 0.1, D: 0.8, S: 0.6, R: 0.25, ch: 0 }],
    ['Minimal Click Bass', 'Bass', 'Minimal Techno', { cut: 220, res: 0.3, env: 0.7, A: 0.001, D: 0.08, S: 0, R: 0.05, ch: 0 }],
    ['Trance Offbeat Bass', 'Bass', 'Trance', { cut: 500, res: 0.3, env: 0.45, D: 0.12, S: 0.1, R: 0.06, hpf: 40, ch: 0 }],

    // ---------- Lead ----------
    ['Halden Square Lead', 'Lead', 'Synthpop', { saw: 0, pulse: 1, pwm: 0, cut: 2500, res: 0.2, env: 0.2, A: 0.01, D: 0.4, S: 0.8, R: 0.25, vib: 0.25, rate: 5.5, delay: 0.4, mono: 'gml' }],
    ['PWM Solo', 'Lead', 'New Wave', { saw: 0, pulse: 1, pwm: 0.5, pwmMod: true, rate: 4.5, vib: 0.15, delay: 0.5, cut: 3000, res: 0.15, S: 0.8, mono: 'gml' }],
    ['Screaming Lead', 'Lead', 'Rock', { pulse: 1, pwm: 0.7, pwmMod: true, pwmSrc: 'env', cut: 1500, res: 0.6, env: 0.5, D: 0.5, S: 0.6, R: 0.2, mono: 'ml', ch: 0 }],
    ['Synthwave Lead', 'Lead', 'Synthwave', { pulse: 1, pwm: 0.3, pwmMod: true, cut: 2200, res: 0.25, env: 0.3, A: 0.02, D: 0.6, S: 0.7, R: 0.4, vib: 0.2, delay: 0.6, ch: 3, mono: 'gml' }],
    ['G-Funk Whistle', 'Lead', 'West Coast Hip-Hop', { saw: 0, pulse: 1, pwm: 0, cut: 1200, res: 0.55, env: 0.1, A: 0.05, S: 1, R: 0.2, vib: 0.25, rate: 6, delay: 0.3, kybd: 1, mono: 'gml' }],
    ['Trance Lead', 'Lead', 'Trance', { pulse: 1, pwm: 0.45, pwmMod: true, rate: 6, cut: 4000, res: 0.15, env: 0.2, A: 0.01, D: 0.3, S: 0.8, R: 0.4, ch: 3 }],
    ['Acid Lead', 'Lead', 'Acid House', { cut: 600, res: 0.75, env: 0.6, D: 0.3, S: 0.3, R: 0.1, mono: 'gml', ch: 0, velo: 0.5 }],
    ['Chiptune Lead', 'Lead', 'Chiptune', { saw: 0, pulse: 1, pwm: 0.5, cut: 18000, res: 0, env: 0, A: 0.001, D: 0.1, S: 1, R: 0.05, gate: true, vib: 0.15, rate: 7, delay: 0.2, ch: 0 }],
    ['Lo-fi Flute', 'Lead', 'Lo-fi Hip-Hop', { saw: 0, pulse: 1, pwm: 0, noise: 0.15, cut: 1100, env: 0.15, A: 0.08, D: 0.5, S: 0.7, R: 0.3, vib: 0.15, rate: 5, delay: 0.5, mono: 'gml' }],
    ['Funk Clav Lead', 'Lead', 'Funk', { saw: 0, pulse: 1, pwm: 0.6, cut: 1800, res: 0.3, env: 0.45, A: 0.001, D: 0.2, S: 0.2, R: 0.1, velo: 0.7, ch: 0 }],
    ['Prog Rock Lead', 'Lead', 'Prog Rock', { sub: 1, subLvl: 0.3, cut: 1200, res: 0.4, env: 0.45, A: 0.005, D: 0.6, S: 0.5, R: 0.3, vib: 0.2, delay: 0.7, mono: 'gml' }],
    ['Hoover Lead', 'Lead', 'Rave', { pulse: 1, pwm: 0.6, pwmMod: true, rate: 1.2, cut: 2500, res: 0.2, env: 0.3, inv: true, D: 0.8, S: 0.8, R: 0.4, ch: 3, mono: 'gml', bend: 12 }],
    ['Future Bass Lead', 'Lead', 'Future Bass', { pulse: 1, pwm: 0.3, pwmMod: true, cut: 3000, res: 0.2, env: 0.25, A: 0.005, D: 0.35, S: 0.6, R: 0.3, ch: 3 }],
    ['Retro Game Square', 'Lead', 'Chiptune', { saw: 0, pulse: 1, pwm: 0, cut: 18000, env: 0, gate: true, S: 1, R: 0.02, ch: 0, mono: 'ml' }],
    ['Mellow Sine Lead', 'Lead', 'Jazz Fusion', { saw: 0, pulse: 1, pwm: 0, cut: 600, res: 0, kybd: 1, env: 0.05, A: 0.05, D: 1, S: 0.9, R: 0.5, vib: 0.15, delay: 0.8, mono: 'gml' }],

    // ---------- Pad ----------
    ['Classic Halden Pad', 'Pad', 'Synthpop', { cut: 1400, env: 0.15, A: 0.6, D: 1.5, S: 0.8, R: 1.5 }],
    ['PWM String Pad', 'Pad', '80s Pop', { saw: 0, pulse: 1, pwm: 0.6, pwmMod: true, rate: 0.8, cut: 2500, res: 0.05, env: 0.1, A: 0.8, D: 2, S: 0.9, R: 1.8, ch: 2 }],
    ['Synthwave Sunset Pad', 'Pad', 'Synthwave', { pulse: 1, pwm: 0.4, pwmMod: true, rate: 0.5, cut: 1800, res: 0.2, env: 0.2, A: 1, D: 2, S: 0.8, R: 2.5, ch: 3 }],
    ['Ambient Drift', 'Pad', 'Ambient', { noise: 0.1, cut: 900, res: 0.3, env: 0, flfo: 0.3, rate: 0.15, wave: 'tri', A: 2.5, D: 3, S: 0.9, R: 4, ch: 3 }],
    ['Dark Cinematic Pad', 'Pad', 'Cinematic', { sub: 1, cut: 500, res: 0.25, env: 0.2, A: 1.5, D: 3, S: 0.8, R: 3, hpf: 40, ch: 2 }],
    ['Chillwave Haze', 'Pad', 'Chillwave', { saw: 0, pulse: 1, pwm: 0.4, pwmMod: true, cut: 1100, env: 0.1, A: 0.9, S: 0.85, R: 2, vib: 0.08, ch: 3 }],
    ['Vaporwave Mall', 'Pad', 'Vaporwave', { cut: 1300, env: 0, A: 0.4, D: 2, S: 0.8, R: 2, vib: 0.12, rate: 0.7, wave: 'tri', ch: 3 }],
    ['Trance Pad', 'Pad', 'Trance', { pulse: 1, pwm: 0.5, pwmMod: true, cut: 3000, res: 0.2, env: 0.15, A: 0.4, D: 1, S: 0.9, R: 1.5, hpf: 120, ch: 3 }],
    ['Lo-fi Tape Pad', 'Pad', 'Lo-fi Hip-Hop', { noise: 0.08, cut: 900, res: 0.05, env: 0, A: 0.5, D: 2, S: 0.7, R: 1.6, vib: 0.1, rate: 0.5 }],
    ['Glass Pad', 'Pad', 'New Age', { saw: 0, pulse: 1, pwm: 0.7, cut: 3500, res: 0.45, env: 0.1, A: 1, D: 2, S: 0.7, R: 2.5, hpf: 200, ch: 2 }],
    ['Slow Sweep Pad', 'Pad', 'Synthpop', { cut: 400, res: 0.5, env: 0.5, A: 1.5, D: 4, S: 0.6, R: 2 }],
    ['Warm Analog Pad', 'Pad', 'R&B / Soul', { sub: 1, subLvl: 0.3, cut: 1000, res: 0.05, env: 0, A: 0.5, D: 1.5, S: 0.85, R: 1.2 }],
    ['Stranger Pad', 'Pad', 'Retrowave', { cut: 700, res: 0.35, env: 0, flfo: 0.35, rate: 0.2, A: 1.2, D: 2, S: 0.9, R: 2.5, ch: 2 }],
    ['Breathing Pad', 'Pad', 'Ambient', { saw: 0, pulse: 1, pwm: 0.5, pwmMod: true, rate: 0.25, noise: 0.1, cut: 1500, env: 0, A: 2, S: 1, R: 3, ch: 3 }],
    ['Downtempo Pad', 'Pad', 'Downtempo', { cut: 1200, res: 0.15, env: 0.1, A: 0.7, D: 2, S: 0.75, R: 1.5, vib: 0.05 }],
    ['Choir Pad', 'Pad', 'Cinematic', { saw: 0, pulse: 1, pwm: 0.3, pwmMod: true, noise: 0.05, cut: 1600, res: 0.25, env: 0, A: 0.9, S: 0.9, R: 2, hpf: 150, vib: 0.06, ch: 3 }],

    // ---------- Keys ----------
    ['Halden Piano', 'Keys', 'Pop', { pulse: 1, pwm: 0.2, cut: 1600, res: 0.05, env: 0.35, A: 0.002, D: 1.2, S: 0.1, R: 0.5, velo: 0.6, kybd: 0.7 }],
    ['House Organ', 'Keys', 'House', { saw: 0, pulse: 1, pwm: 0, sub: 1, cut: 5000, env: 0, S: 1, R: 0.05, gate: true }],
    ['Electric Piano', 'Keys', 'Neo Soul', { saw: 0, pulse: 1, pwm: 0.1, cut: 1200, res: 0, env: 0.3, A: 0.002, D: 1.6, S: 0.2, R: 0.6, velo: 0.7, vib: 0.05, rate: 5, ch: 2 }],
    ['Funk Clavinet', 'Keys', 'Funk', { saw: 0, pulse: 1, pwm: 0.75, cut: 2000, res: 0.3, env: 0.4, A: 0.001, D: 0.25, S: 0.1, R: 0.08, velo: 0.7, hpf: 150, ch: 0 }],
    ['Synthpop Stab', 'Keys', 'Synthpop', { cut: 1500, res: 0.2, env: 0.35, A: 0.002, D: 0.3, S: 0.2, R: 0.2 }],
    ['Lo-fi Keys', 'Keys', 'Lo-fi Hip-Hop', { saw: 0, pulse: 1, pwm: 0.2, noise: 0.05, cut: 900, env: 0.2, D: 1, S: 0.3, R: 0.5, vib: 0.08, rate: 4.5, velo: 0.5 }],
    ['Skank Organ', 'Keys', 'Reggae / Dub', { saw: 0, pulse: 1, pwm: 0.2, cut: 2500, env: 0.2, A: 0.002, D: 0.15, S: 0.2, R: 0.05, hpf: 250, ch: 0 }],
    ['Chord Memory Stab', 'Keys', 'UK Garage', { pulse: 1, pwm: 0.3, cut: 1100, res: 0.35, env: 0.45, D: 0.25, S: 0.1, R: 0.15 }],
    ['Toy Piano', 'Keys', 'Indie', { saw: 0, pulse: 1, pwm: 0.5, cut: 3500, env: 0.2, A: 0.001, D: 0.5, S: 0, R: 0.3, hpf: 300, ch: 0 }],
    ['Gospel Organ', 'Keys', 'Gospel', { saw: 0, pulse: 1, pwm: 0, sub: 1, subLvl: 0.4, cut: 3500, env: 0, A: 0.005, S: 1, R: 0.1, gate: true, vib: 0.1, rate: 6, ch: 3 }],

    // ---------- Brass ----------
    ['Halden Brass', 'Brass', 'Synthpop', { cut: 700, res: 0.15, env: 0.5, A: 0.06, D: 0.5, S: 0.7, R: 0.25, kybd: 0.6, velo: 0.4 }],
    ['Jump Brass', 'Brass', '80s Rock', { cut: 800, res: 0.1, env: 0.5, A: 0.03, D: 0.35, S: 0.7, R: 0.2 }],
    ['Soft Horn', 'Brass', 'Cinematic', { cut: 500, res: 0.05, env: 0.35, A: 0.15, D: 0.8, S: 0.7, R: 0.4, vib: 0.1, delay: 0.6 }],
    ['Brass Swell', 'Brass', 'Synthwave', { pulse: 1, pwm: 0.3, cut: 400, res: 0.2, env: 0.55, A: 0.4, D: 1.2, S: 0.8, R: 0.5, ch: 3 }],
    ['Fanfare', 'Brass', 'Film Score', { sub: 1, subLvl: 0.3, cut: 900, res: 0.15, env: 0.45, A: 0.04, D: 0.4, S: 0.75, R: 0.25, ch: 2 }],
    ['Funk Horn Section', 'Brass', 'Funk', { cut: 1000, res: 0.2, env: 0.5, A: 0.02, D: 0.2, S: 0.5, R: 0.1, velo: 0.5 }],
    ['Mono Trumpet', 'Brass', 'Jazz', { cut: 900, res: 0.1, env: 0.4, A: 0.05, D: 0.5, S: 0.7, R: 0.15, vib: 0.2, delay: 0.4, mono: 'gml', ch: 0 }],
    ['House Brass Stab', 'Brass', 'House', { pulse: 1, pwm: 0.2, cut: 1200, res: 0.25, env: 0.5, A: 0.005, D: 0.2, S: 0.1, R: 0.1 }],

    // ---------- Strings ----------
    ['String Machine', 'Strings', 'Disco', { cut: 2200, res: 0.05, env: 0.05, A: 0.25, D: 1, S: 0.9, R: 0.8, ch: 3 }],
    ['Lush Strings', 'Strings', 'Cinematic', { pulse: 1, pwm: 0.5, pwmMod: true, rate: 0.6, cut: 2500, env: 0, A: 0.6, S: 0.9, R: 1.5, hpf: 80, ch: 3 }],
    ['Disco Strings', 'Strings', 'Disco', { cut: 3000, res: 0.1, env: 0, A: 0.08, D: 0.5, S: 0.85, R: 0.5, vib: 0.05, rate: 5.5, ch: 2 }],
    ['Pizzicato', 'Strings', 'Classical Pop', { cut: 1500, res: 0.1, env: 0.3, A: 0.002, D: 0.25, S: 0, R: 0.25, hpf: 100, velo: 0.5 }],
    ['Slow Ensemble', 'Strings', 'Ambient', { cut: 1800, env: 0, A: 1.2, D: 2, S: 0.9, R: 2.5, vib: 0.06, rate: 4.5, delay: 1, ch: 3 }],
    ['Mono Cello', 'Strings', 'Cinematic', { cut: 900, res: 0.1, env: 0.2, A: 0.15, S: 0.9, R: 0.3, vib: 0.15, rate: 5, delay: 0.5, mono: 'gml' }],
    ['Synthwave Strings', 'Strings', 'Synthwave', { pulse: 1, pwm: 0.4, pwmMod: true, cut: 2000, env: 0, A: 0.4, S: 0.85, R: 1.2, ch: 2 }],
    ['High Octave Strings', 'Strings', 'Pop', { saw: 0, pulse: 1, pwm: 0.6, pwmMod: true, cut: 4000, env: 0, hpf: 300, A: 0.3, S: 0.9, R: 1, ch: 3 }],

    // ---------- Pluck ----------
    ['Synthpop Pluck', 'Pluck', 'Synthpop', { cut: 500, res: 0.3, env: 0.55, A: 0.001, D: 0.25, S: 0, R: 0.3 }],
    ['Tropical Pluck', 'Pluck', 'Tropical House', { saw: 0, pulse: 1, pwm: 0.2, cut: 800, res: 0.2, env: 0.5, A: 0.001, D: 0.18, S: 0, R: 0.2, hpf: 150, ch: 2 }],
    ['Harp Pluck', 'Pluck', 'New Age', { cut: 1200, res: 0.1, env: 0.3, A: 0.001, D: 0.8, S: 0, R: 0.8, ch: 3 }],
    ['Marimba', 'Pluck', 'World', { saw: 0, pulse: 1, pwm: 0, cut: 900, res: 0.3, env: 0.3, A: 0.001, D: 0.25, S: 0, R: 0.25, kybd: 1, ch: 0 }],
    ['Kalimba', 'Pluck', 'Afrobeats', { saw: 0, pulse: 1, pwm: 0.4, cut: 1500, res: 0.35, env: 0.25, A: 0.001, D: 0.35, S: 0, R: 0.3, hpf: 250 }],
    ['Trance Pluck', 'Pluck', 'Trance', { pulse: 1, pwm: 0.3, cut: 600, res: 0.4, env: 0.55, D: 0.2, S: 0, R: 0.25, ch: 3 }],
    ['K-Pop Pluck', 'Pluck', 'K-Pop', { cut: 900, res: 0.25, env: 0.5, D: 0.15, S: 0, R: 0.15, hpf: 200 }],
    ['Jangle Pluck', 'Pluck', 'Indie Rock', { pulse: 1, pwm: 0.3, cut: 700, res: 0.2, env: 0.45, D: 0.6, S: 0.1, R: 0.4, velo: 0.6 }],
    ['Bubble Pluck', 'Pluck', 'Electro', { saw: 0, pulse: 1, pwm: 0.5, cut: 300, res: 0.85, env: 0.5, D: 0.12, S: 0, R: 0.1, ch: 0 }],

    // ---------- Bell ----------
    ['Halden Bell', 'Bell', 'Synthpop', { saw: 0, pulse: 1, pwm: 0.85, cut: 4000, res: 0.5, env: 0.2, A: 0.001, D: 1.5, S: 0, R: 1.5, hpf: 300, ch: 2 }],
    ['Music Box', 'Bell', 'Lullaby', { saw: 0, pulse: 1, pwm: 0.9, cut: 6000, res: 0.3, env: 0, A: 0.001, D: 0.9, S: 0, R: 0.9, hpf: 500, kybd: 1 }],
    ['Glass Bell', 'Bell', 'Ambient', { saw: 0, pulse: 1, pwm: 0.8, cut: 5000, res: 0.6, env: 0.2, A: 0.001, D: 2.5, S: 0, R: 2.5, ch: 3 }],
    ['Chime Pad', 'Bell', 'New Age', { saw: 0, pulse: 1, pwm: 0.85, noise: 0.05, cut: 3000, res: 0.4, env: 0, A: 0.002, D: 3, S: 0.2, R: 3, hpf: 200, ch: 3 }],
    ['Holiday Bells', 'Bell', 'Pop', { pulse: 1, pwm: 0.9, cut: 4500, res: 0.35, env: 0, A: 0.001, D: 1.2, S: 0, R: 1.2, hpf: 400, ch: 2 }],

    // ---------- Arp / Sequence ----------
    ['Arp Sparkle', 'Arp', 'Synthpop', { saw: 0, pulse: 1, pwm: 0.4, cut: 1500, res: 0.3, env: 0.3, A: 0.001, D: 0.15, S: 0, R: 0.15, ch: 2 }],
    ['Stranger Arp', 'Arp', 'Synthwave', { cut: 500, res: 0.45, env: 0.5, D: 0.2, S: 0.05, R: 0.15, flfo: 0.2, rate: 0.1, wave: 'tri' }],
    ['Berlin Sequence', 'Arp', 'Berlin School', { cut: 400, res: 0.55, env: 0.45, D: 0.25, S: 0.1, R: 0.2, flfo: 0.25, rate: 0.08, wave: 'tri', ch: 0 }],
    ['Italo Arp', 'Arp', 'Italo Disco', { saw: 0, pulse: 1, pwm: 0.2, cut: 900, res: 0.3, env: 0.4, D: 0.12, S: 0.1, R: 0.1, ch: 2 }],
    ['Trance Gate', 'Arp', 'Trance', { pulse: 1, pwm: 0.4, pwmMod: true, cut: 2000, res: 0.2, env: 0, A: 0.002, S: 1, R: 0.03, gate: true, ch: 3 }],
    ['Minimal Blip', 'Arp', 'Minimal Techno', { saw: 0, pulse: 1, pwm: 0, cut: 1000, res: 0.6, env: 0.4, A: 0.001, D: 0.06, S: 0, R: 0.05, ch: 0 }],

    // ---------- FX ----------
    ['Wind', 'FX', 'Sound Design', { saw: 0, noise: 1, cut: 600, res: 0.6, env: 0, flfo: 0.6, rate: 0.12, wave: 'tri', A: 1.5, S: 1, R: 2, ch: 3 }],
    ['Laser Zap', 'FX', 'Sound Design', { cut: 200, res: 0.9, env: 1, A: 0.001, D: 0.2, S: 0, R: 0.1, ch: 0 }],
    ['Siren', 'FX', 'Sound Design', { saw: 0, pulse: 1, pwm: 0, cut: 3000, env: 0, vib: 1, rate: 1.5, wave: 'tri', S: 1, R: 0.3, mono: 'ml', ch: 0 }],
    ['Ocean Surf', 'FX', 'Ambient', { saw: 0, noise: 1, cut: 400, res: 0.2, env: 0, flfo: 0.7, rate: 0.08, A: 2, S: 1, R: 3, hpf: 30, ch: 3 }],
    ['UFO Wobble', 'FX', 'Sound Design', { saw: 0, pulse: 1, pwm: 0.5, pwmMod: true, cut: 1200, res: 0.7, env: 0, flfo: 0.7, rate: 5, vib: 0.4, S: 1, R: 0.5, ch: 2 }],
  ];

  window.PRESETS = LIST.map(([name, cat, genre, o], i) => ({ num: i + 1, name, cat, genre, values: toPanel(o) }));
  window.PRESET_CATEGORIES = [...new Set(LIST.map(x => x[1]))];
})();
