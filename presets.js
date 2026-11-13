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
    cut: 3000, res: 0.07, env: 0.3, inv: false, flfo: 0, kybd: 0.5, hpf: 10,
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
    ['Halden Sub Bass', 'Bass', 'Synthpop', { saw: 0, pulse: 1, pwm: 0, sub: 1, subLvl: 0.8, cut: 313, env: 0.25, D: 0.3, S: 0.6, R: 0.1, ch: 0, mono: 'ml', kybd: 0.3, level: 0.86 }],
    ['Italo Octave Bass', 'Bass', 'Italo Disco', { sub: 1, cut: 559, res: 0.2, env: 0.45, D: 0.18, S: 0.2, R: 0.08, ch: 0, level: 0.93 }],
    ['Hi-NRG Pluck Bass', 'Bass', 'Hi-NRG', { cut: 679, res: 0.23, env: 0.55, D: 0.14, S: 0.1, R: 0.06, ch: 0, level: 0.91 }],
    ['Acid Squelch', 'Bass', 'Acid House', { cut: 328, res: 0.56, env: 0.6, D: 0.25, S: 0.05, R: 0.05, mono: 'gml', kybd: 0.3, ch: 0, velo: 0.6, level: 0.63 }],
    ['Acid Square', 'Bass', 'Acid House', { saw: 0, pulse: 1, pwm: 0, cut: 424, res: 0.53, env: 0.5, D: 0.2, S: 0.1, R: 0.05, mono: 'ml', ch: 0, level: 0.63 }],
    ['Deep House Bass', 'Bass', 'Deep House', { saw: 0, pulse: 1, pwm: 0.1, sub: 1, subLvl: 0.6, cut: 394, res: 0.11, env: 0.2, D: 0.35, S: 0.4, R: 0.12, ch: 0, level: 0.91 }],
    ['Synthwave Drive Bass', 'Bass', 'Synthwave', { sub: 1, subLvl: 0.4, cut: 514, res: 0.17, env: 0.4, D: 0.2, S: 0.3, R: 0.1, level: 0.62 }],
    ['Techno Rumble', 'Bass', 'Techno', { sub: 1, subLvl: 0.7, cut: 197, res: 0.26, env: 0.3, D: 0.5, S: 0.2, R: 0.2, hpf: 30, ch: 0, level: 1 }],
    ['Electro Funk Bass', 'Bass', 'Electro', { saw: 0, pulse: 1, pwm: 0.25, cut: 551, res: 0.3, env: 0.55, D: 0.16, S: 0.15, R: 0.07, mono: 'ml', ch: 0, velo: 0.6, level: 0.78 }],
    ['Rubber Bass', 'Bass', 'Funk', { cut: 326, res: 0.36, env: 0.45, A: 0.005, D: 0.22, S: 0.25, R: 0.1, mono: 'gml', ch: 0, level: 0.67 }],
    ['Sine Sub 808', 'Bass', 'Trap', { saw: 0, sub: 1, subLvl: 1, cut: 200, res: 0, env: 0, D: 1.5, S: 0, R: 0.3, mono: 'gml', ch: 0, level: 1 }],
    ['Lo-fi Warm Bass', 'Bass', 'Lo-fi Hip-Hop', { cut: 350, res: 0.04, env: 0.15, D: 0.6, S: 0.5, R: 0.2, vib: 0.1, rate: 5, delay: 0.3, level: 0.61 }],
    ['Reese Bass', 'Bass', 'Drum & Bass', { pulse: 1, pwm: 0.4, pwmMod: true, rate: 0.3, cut: 411, res: 0.17, env: 0.1, D: 1, S: 1, R: 0.2, ch: 3, mono: 'ml', level: 0.57 }],
    ['Wobble Bass', 'Bass', 'Dubstep', { sub: 1, cut: 177, res: 0.33, env: 0, flfo: 0.8, wave: 'tri', tempo: 4, retrig: true, S: 1, R: 0.1, mono: 'ml', ch: 0, level: 0.7 }],
    ['Disco Octave Bass', 'Bass', 'Disco', { saw: 0, pulse: 1, pwm: 0.2, cut: 800, res: 0.14, env: 0.35, D: 0.15, S: 0.3, R: 0.1, level: 0.54 }],
    ['Dub Bass', 'Bass', 'Reggae / Dub', { saw: 0, pulse: 1, pwm: 0, sub: 1, subLvl: 0.6, cut: 227, env: 0.1, D: 0.8, S: 0.6, R: 0.25, ch: 0, level: 1 }],
    ['Minimal Click Bass', 'Bass', 'Minimal Techno', { cut: 175, res: 0.2, env: 0.7, A: 0.001, D: 0.08, S: 0, R: 0.05, ch: 0, level: 1 }],
    ['Trance Offbeat Bass', 'Bass', 'Trance', { cut: 796, res: 0.2, env: 0.45, D: 0.12, S: 0.1, R: 0.06, hpf: 40, ch: 0, level: 0.98 }],

    // ---------- Lead ----------
    ['Halden Square Lead', 'Lead', 'Synthpop', { saw: 0, pulse: 1, pwm: 0, cut: 2310, res: 0.14, env: 0.2, A: 0.01, D: 0.4, S: 0.8, R: 0.25, vib: 0.25, rate: 5.5, delay: 0.4, mono: 'gml', level: 0.52 }],
    ['PWM Solo', 'Lead', 'New Wave', { saw: 0, pulse: 1, pwm: 0.5, pwmMod: true, rate: 4.5, vib: 0.15, delay: 0.5, cut: 2900, res: 0.11, S: 0.8, mono: 'gml', level: 0.53 }],
    ['Screaming Lead', 'Lead', 'Rock', { pulse: 1, pwm: 0.7, pwmMod: true, pwmSrc: 'env', cut: 3810, res: 0.39, env: 0.5, D: 0.5, S: 0.6, R: 0.2, mono: 'ml', ch: 0, level: 0.52 }],
    ['Synthwave Lead', 'Lead', 'Synthwave', { pulse: 1, pwm: 0.3, pwmMod: true, cut: 3810, res: 0.17, env: 0.3, A: 0.02, D: 0.6, S: 0.7, R: 0.4, vib: 0.2, delay: 0.6, ch: 3, mono: 'gml', level: 0.43 }],
    ['G-Funk Whistle', 'Lead', 'West Coast Hip-Hop', { saw: 0, pulse: 1, pwm: 0, cut: 1360, res: 0.36, env: 0.1, A: 0.05, S: 1, R: 0.2, vib: 0.25, rate: 6, delay: 0.3, kybd: 1, mono: 'gml', level: 0.38 }],
    ['Trance Lead', 'Lead', 'Trance', { pulse: 1, pwm: 0.45, pwmMod: true, rate: 6, cut: 6400, res: 0.11, env: 0.2, A: 0.01, D: 0.3, S: 0.8, R: 0.4, ch: 3, level: 0.4 }],
    ['Acid Lead', 'Lead', 'Acid House', { cut: 1010, res: 0.5, env: 0.6, D: 0.3, S: 0.3, R: 0.1, mono: 'gml', ch: 0, velo: 0.5, level: 0.55 }],
    ['Chiptune Lead', 'Lead', 'Chiptune', { saw: 0, pulse: 1, pwm: 0.5, cut: 18000, res: 0, env: 0, A: 0.001, D: 0.1, S: 1, R: 0.05, gate: true, vib: 0.15, rate: 7, delay: 0.2, ch: 0 }],
    ['Lo-fi Flute', 'Lead', 'Lo-fi Hip-Hop', { saw: 0, pulse: 1, pwm: 0, noise: 0.15, cut: 1080, env: 0.15, A: 0.08, D: 0.5, S: 0.7, R: 0.3, vib: 0.15, rate: 5, delay: 0.5, mono: 'gml', level: 0.55 }],
    ['Funk Clav Lead', 'Lead', 'Funk', { saw: 0, pulse: 1, pwm: 0.6, cut: 2730, res: 0.2, env: 0.45, A: 0.001, D: 0.2, S: 0.2, R: 0.1, velo: 0.7, ch: 0, level: 0.81 }],
    ['Prog Rock Lead', 'Lead', 'Prog Rock', { sub: 1, subLvl: 0.3, cut: 1460, res: 0.26, env: 0.45, A: 0.005, D: 0.6, S: 0.5, R: 0.3, vib: 0.2, delay: 0.7, mono: 'gml', level: 0.51 }],
    ['Hoover Lead', 'Lead', 'Rave', { pulse: 1, pwm: 0.6, pwmMod: true, rate: 1.2, cut: 3210, res: 0.14, env: 0.3, inv: true, D: 0.8, S: 0.8, R: 0.4, ch: 3, mono: 'gml', bend: 12, level: 0.42 }],
    ['Future Bass Lead', 'Lead', 'Future Bass', { pulse: 1, pwm: 0.3, pwmMod: true, cut: 4460, res: 0.14, env: 0.25, A: 0.005, D: 0.35, S: 0.6, R: 0.3, ch: 3, level: 0.45 }],
    ['Retro Game Square', 'Lead', 'Chiptune', { saw: 0, pulse: 1, pwm: 0, cut: 18000, env: 0, gate: true, S: 1, R: 0.02, ch: 0, mono: 'ml', level: 0.67 }],
    ['Mellow Sine Lead', 'Lead', 'Jazz Fusion', { saw: 0, pulse: 1, pwm: 0, cut: 551, res: 0, kybd: 1, env: 0.05, A: 0.05, D: 1, S: 0.9, R: 0.5, vib: 0.15, delay: 0.8, mono: 'gml', level: 0.58 }],

    // ---------- Pad ----------
    ['Classic Halden Pad', 'Pad', 'Synthpop', { cut: 1320, env: 0.15, A: 0.6, D: 1.5, S: 0.8, R: 1.5, level: 0.6 }],
    ['PWM String Pad', 'Pad', '80s Pop', { saw: 0, pulse: 1, pwm: 0.6, pwmMod: true, rate: 0.8, cut: 1920, res: 0.04, env: 0.1, A: 0.8, D: 2, S: 0.9, R: 1.8, ch: 2, level: 0.65 }],
    ['Synthwave Sunset Pad', 'Pad', 'Synthwave', { pulse: 1, pwm: 0.4, pwmMod: true, rate: 0.5, cut: 1440, res: 0.14, env: 0.2, A: 1, D: 2, S: 0.8, R: 2.5, ch: 3, level: 0.55 }],
    ['Ambient Drift', 'Pad', 'Ambient', { noise: 0.1, cut: 805, res: 0.2, env: 0, flfo: 0.3, rate: 0.15, wave: 'tri', A: 2.5, D: 3, S: 0.9, R: 4, ch: 3, level: 0.57 }],
    ['Dark Cinematic Pad', 'Pad', 'Cinematic', { sub: 1, cut: 372, res: 0.17, env: 0.2, A: 1.5, D: 3, S: 0.8, R: 3, hpf: 40, ch: 2, level: 0.68 }],
    ['Chillwave Haze', 'Pad', 'Chillwave', { saw: 0, pulse: 1, pwm: 0.4, pwmMod: true, cut: 852, env: 0.1, A: 0.9, S: 0.85, R: 2, vib: 0.08, ch: 3, level: 0.65 }],
    ['Vaporwave Mall', 'Pad', 'Vaporwave', { cut: 1300, env: 0, A: 0.4, D: 2, S: 0.8, R: 2, vib: 0.12, rate: 0.7, wave: 'tri', ch: 3, level: 0.6 }],
    ['Trance Pad', 'Pad', 'Trance', { pulse: 1, pwm: 0.5, pwmMod: true, cut: 3140, res: 0.14, env: 0.15, A: 0.4, D: 1, S: 0.9, R: 1.5, hpf: 120, ch: 3, level: 0.5 }],
    ['Lo-fi Tape Pad', 'Pad', 'Lo-fi Hip-Hop', { noise: 0.08, cut: 900, res: 0.04, env: 0, A: 0.5, D: 2, S: 0.7, R: 1.6, vib: 0.1, rate: 0.5, level: 0.62 }],
    ['Glass Pad', 'Pad', 'New Age', { saw: 0, pulse: 1, pwm: 0.7, cut: 3100, res: 0.3, env: 0.1, A: 1, D: 2, S: 0.7, R: 2.5, hpf: 200, ch: 2, level: 0.51 }],
    ['Slow Sweep Pad', 'Pad', 'Synthpop', { cut: 377, res: 0.33, env: 0.5, A: 1.5, D: 4, S: 0.6, R: 2, level: 0.43 }],
    ['Warm Analog Pad', 'Pad', 'R&B / Soul', { sub: 1, subLvl: 0.3, cut: 840, res: 0.04, env: 0, A: 0.5, D: 1.5, S: 0.85, R: 1.2, level: 0.68 }],
    ['Stranger Pad', 'Pad', 'Retrowave', { cut: 647, res: 0.23, env: 0, flfo: 0.35, rate: 0.2, A: 1.2, D: 2, S: 0.9, R: 2.5, ch: 2, level: 0.51 }],
    ['Breathing Pad', 'Pad', 'Ambient', { saw: 0, pulse: 1, pwm: 0.5, pwmMod: true, rate: 0.25, noise: 0.1, cut: 1090, env: 0, A: 2, S: 1, R: 3, ch: 3, level: 0.64 }],
    ['Downtempo Pad', 'Pad', 'Downtempo', { cut: 1120, res: 0.11, env: 0.1, A: 0.7, D: 2, S: 0.75, R: 1.5, vib: 0.05, level: 0.58 }],
    ['Choir Pad', 'Pad', 'Cinematic', { saw: 0, pulse: 1, pwm: 0.3, pwmMod: true, noise: 0.05, cut: 1430, res: 0.17, env: 0, A: 0.9, S: 0.9, R: 2, hpf: 150, vib: 0.06, ch: 3, level: 0.59 }],

    // ---------- Keys ----------
    ['Halden Piano', 'Keys', 'Pop', { pulse: 1, pwm: 0.2, cut: 2010, res: 0.04, env: 0.35, A: 0.002, D: 1.2, S: 0.1, R: 0.5, velo: 0.6, kybd: 0.7, level: 0.9 }],
    ['House Organ', 'Keys', 'House', { saw: 0, pulse: 1, pwm: 0, sub: 1, cut: 4020, env: 0, S: 1, R: 0.05, gate: true, level: 0.51 }],
    ['Electric Piano', 'Keys', 'Neo Soul', { saw: 0, pulse: 1, pwm: 0.1, cut: 1200, res: 0, env: 0.3, A: 0.002, D: 1.6, S: 0.2, R: 0.6, velo: 0.7, vib: 0.05, rate: 5, ch: 2, level: 0.75 }],
    ['Funk Clavinet', 'Keys', 'Funk', { saw: 0, pulse: 1, pwm: 0.75, cut: 2440, res: 0.2, env: 0.4, A: 0.001, D: 0.25, S: 0.1, R: 0.08, velo: 0.7, hpf: 150, ch: 0, level: 0.95 }],
    ['Synthpop Stab', 'Keys', 'Synthpop', { cut: 2050, res: 0.14, env: 0.35, A: 0.002, D: 0.3, S: 0.2, R: 0.2, level: 0.63 }],
    ['Lo-fi Keys', 'Keys', 'Lo-fi Hip-Hop', { saw: 0, pulse: 1, pwm: 0.2, noise: 0.05, cut: 951, env: 0.2, D: 1, S: 0.3, R: 0.5, vib: 0.08, rate: 4.5, velo: 0.5, level: 0.68 }],
    ['Skank Organ', 'Keys', 'Reggae / Dub', { saw: 0, pulse: 1, pwm: 0.2, cut: 3910, env: 0.2, A: 0.002, D: 0.15, S: 0.2, R: 0.05, hpf: 250, ch: 0, level: 0.84 }],
    ['Chord Memory Stab', 'Keys', 'UK Garage', { pulse: 1, pwm: 0.3, cut: 2000, res: 0.23, env: 0.45, D: 0.25, S: 0.1, R: 0.15, level: 0.8 }],
    ['Toy Piano', 'Keys', 'Indie', { saw: 0, pulse: 1, pwm: 0.5, cut: 3970, env: 0.2, A: 0.001, D: 0.5, S: 0, R: 0.3, hpf: 300, ch: 0, level: 1 }],
    ['Gospel Organ', 'Keys', 'Gospel', { saw: 0, pulse: 1, pwm: 0, sub: 1, subLvl: 0.4, cut: 3070, env: 0, A: 0.005, S: 1, R: 0.1, gate: true, vib: 0.1, rate: 6, ch: 3, level: 0.43 }],

    // ---------- Brass ----------
    ['Halden Brass', 'Brass', 'Synthpop', { cut: 871, res: 0.11, env: 0.5, A: 0.06, D: 0.5, S: 0.7, R: 0.25, kybd: 0.6, velo: 0.4, level: 0.52 }],
    ['Jump Brass', 'Brass', '80s Rock', { cut: 920, res: 0.07, env: 0.5, A: 0.03, D: 0.35, S: 0.7, R: 0.2, level: 0.52 }],
    ['Soft Horn', 'Brass', 'Cinematic', { cut: 562, res: 0.04, env: 0.35, A: 0.15, D: 0.8, S: 0.7, R: 0.4, vib: 0.1, delay: 0.6, level: 0.54 }],
    ['Brass Swell', 'Brass', 'Synthwave', { pulse: 1, pwm: 0.3, cut: 636, res: 0.14, env: 0.55, A: 0.4, D: 1.2, S: 0.8, R: 0.5, ch: 3, level: 0.44 }],
    ['Fanfare', 'Brass', 'Film Score', { sub: 1, subLvl: 0.3, cut: 781, res: 0.11, env: 0.45, A: 0.04, D: 0.4, S: 0.75, R: 0.25, ch: 2, level: 0.55 }],
    ['Funk Horn Section', 'Brass', 'Funk', { cut: 1210, res: 0.14, env: 0.5, A: 0.02, D: 0.2, S: 0.5, R: 0.1, velo: 0.5, level: 0.51 }],
    ['Mono Trumpet', 'Brass', 'Jazz', { cut: 999, res: 0.07, env: 0.4, A: 0.05, D: 0.5, S: 0.7, R: 0.15, vib: 0.2, delay: 0.4, mono: 'gml', ch: 0, level: 0.74 }],
    ['House Brass Stab', 'Brass', 'House', { pulse: 1, pwm: 0.2, cut: 2520, res: 0.17, env: 0.5, A: 0.005, D: 0.2, S: 0.1, R: 0.1, level: 0.95 }],

    // ---------- Strings ----------
    ['String Machine', 'Strings', 'Disco', { cut: 2870, res: 0.04, env: 0.05, A: 0.25, D: 1, S: 0.9, R: 0.8, ch: 3, level: 0.52 }],
    ['Lush Strings', 'Strings', 'Cinematic', { pulse: 1, pwm: 0.5, pwmMod: true, rate: 0.6, cut: 2500, env: 0, A: 0.6, S: 0.9, R: 1.5, hpf: 80, ch: 3, level: 0.53 }],
    ['Disco Strings', 'Strings', 'Disco', { cut: 3130, res: 0.07, env: 0, A: 0.08, D: 0.5, S: 0.85, R: 0.5, vib: 0.05, rate: 5.5, ch: 2, level: 0.53 }],
    ['Pizzicato', 'Strings', 'Classical Pop', { cut: 1570, res: 0.07, env: 0.3, A: 0.002, D: 0.25, S: 0, R: 0.25, hpf: 100, velo: 0.5, level: 0.85 }],
    ['Slow Ensemble', 'Strings', 'Ambient', { cut: 1460, env: 0, A: 1.2, D: 2, S: 0.9, R: 2.5, vib: 0.06, rate: 4.5, delay: 1, ch: 3, level: 0.65 }],
    ['Mono Cello', 'Strings', 'Cinematic', { cut: 900, res: 0.07, env: 0.2, A: 0.15, S: 0.9, R: 0.3, vib: 0.15, rate: 5, delay: 0.5, mono: 'gml', level: 0.51 }],
    ['Synthwave Strings', 'Strings', 'Synthwave', { pulse: 1, pwm: 0.4, pwmMod: true, cut: 2000, env: 0, A: 0.4, S: 0.85, R: 1.2, ch: 2, level: 0.69 }],
    ['High Octave Strings', 'Strings', 'Pop', { saw: 0, pulse: 1, pwm: 0.6, pwmMod: true, cut: 6020, env: 0, hpf: 300, A: 0.3, S: 0.9, R: 1, ch: 3, level: 0.53 }],

    // ---------- Pluck ----------
    ['Synthpop Pluck', 'Pluck', 'Synthpop', { cut: 678, res: 0.2, env: 0.55, A: 0.001, D: 0.25, S: 0, R: 0.3, level: 0.76 }],
    ['Tropical Pluck', 'Pluck', 'Tropical House', { saw: 0, pulse: 1, pwm: 0.2, cut: 839, res: 0.14, env: 0.5, A: 0.001, D: 0.18, S: 0, R: 0.2, hpf: 150, ch: 2, level: 1 }],
    ['Harp Pluck', 'Pluck', 'New Age', { cut: 1290, res: 0.07, env: 0.3, A: 0.001, D: 0.8, S: 0, R: 0.8, ch: 3, level: 0.85 }],
    ['Marimba', 'Pluck', 'World', { saw: 0, pulse: 1, pwm: 0, cut: 840, res: 0.2, env: 0.3, A: 0.001, D: 0.25, S: 0, R: 0.25, kybd: 1, ch: 0, level: 1 }],
    ['Kalimba', 'Pluck', 'Afrobeats', { saw: 0, pulse: 1, pwm: 0.4, cut: 2100, res: 0.23, env: 0.25, A: 0.001, D: 0.35, S: 0, R: 0.3, hpf: 250, level: 0.72 }],
    ['Trance Pluck', 'Pluck', 'Trance', { pulse: 1, pwm: 0.3, cut: 625, res: 0.26, env: 0.55, D: 0.2, S: 0, R: 0.25, ch: 3, level: 1 }],
    ['K-Pop Pluck', 'Pluck', 'K-Pop', { cut: 937, res: 0.17, env: 0.5, D: 0.15, S: 0, R: 0.15, hpf: 200, level: 0.83 }],
    ['Jangle Pluck', 'Pluck', 'Indie Rock', { pulse: 1, pwm: 0.3, cut: 1050, res: 0.14, env: 0.45, D: 0.6, S: 0.1, R: 0.4, velo: 0.6, level: 0.83 }],
    ['Bubble Pluck', 'Pluck', 'Electro', { saw: 0, pulse: 1, pwm: 0.5, cut: 317, res: 0.59, env: 0.5, D: 0.12, S: 0, R: 0.1, ch: 0, level: 0.7 }],

    // ---------- Bell ----------
    ['Halden Bell', 'Bell', 'Synthpop', { saw: 0, pulse: 1, pwm: 0.85, cut: 4180, res: 0.33, env: 0.2, A: 0.001, D: 1.5, S: 0, R: 1.5, hpf: 300, ch: 2, level: 0.67 }],
    ['Music Box', 'Bell', 'Lullaby', { saw: 0, pulse: 1, pwm: 0.9, cut: 7450, res: 0.2, env: 0, A: 0.001, D: 0.9, S: 0, R: 0.9, hpf: 500, kybd: 1, level: 0.73 }],
    ['Glass Bell', 'Bell', 'Ambient', { saw: 0, pulse: 1, pwm: 0.8, cut: 18000, res: 0.39, env: 0.2, A: 0.001, D: 2.5, S: 0, R: 2.5, ch: 3, level: 0.63 }],
    ['Chime Pad', 'Bell', 'New Age', { saw: 0, pulse: 1, pwm: 0.85, noise: 0.05, cut: 3620, res: 0.26, env: 0, A: 0.002, D: 3, S: 0.2, R: 3, hpf: 200, ch: 3, level: 0.68 }],
    ['Holiday Bells', 'Bell', 'Pop', { pulse: 1, pwm: 0.9, cut: 4880, res: 0.23, env: 0, A: 0.001, D: 1.2, S: 0, R: 1.2, hpf: 400, ch: 2, level: 0.87 }],

    // ---------- Arp / Sequence ----------
    ['Arp Sparkle', 'Arp', 'Synthpop', { saw: 0, pulse: 1, pwm: 0.4, cut: 1500, res: 0.2, env: 0.3, A: 0.001, D: 0.15, S: 0, R: 0.15, ch: 2, level: 0.79 }],
    ['Stranger Arp', 'Arp', 'Synthwave', { cut: 677, res: 0.3, env: 0.5, D: 0.2, S: 0.05, R: 0.15, flfo: 0.2, rate: 0.1, wave: 'tri', level: 0.66 }],
    ['Berlin Sequence', 'Arp', 'Berlin School', { cut: 509, res: 0.36, env: 0.45, D: 0.25, S: 0.1, R: 0.2, flfo: 0.25, rate: 0.08, wave: 'tri', ch: 0, level: 0.81 }],
    ['Italo Arp', 'Arp', 'Italo Disco', { saw: 0, pulse: 1, pwm: 0.2, cut: 1220, res: 0.2, env: 0.4, D: 0.12, S: 0.1, R: 0.1, ch: 2, level: 0.63 }],
    ['Trance Gate', 'Arp', 'Trance', { pulse: 1, pwm: 0.4, pwmMod: true, cut: 2990, res: 0.14, env: 0, A: 0.002, S: 1, R: 0.03, gate: true, ch: 3, level: 0.36 }],
    ['Minimal Blip', 'Arp', 'Minimal Techno', { saw: 0, pulse: 1, pwm: 0, cut: 706, res: 0.39, env: 0.4, A: 0.001, D: 0.06, S: 0, R: 0.05, ch: 0, level: 0.84 }],

    // ---------- FX ----------
    ['Wind', 'FX', 'Sound Design', { saw: 0, noise: 1, cut: 600, res: 0.39, env: 0, flfo: 0.6, rate: 0.12, wave: 'tri', A: 1.5, S: 1, R: 2, ch: 3, level: 0.26 }],
    ['Laser Zap', 'FX', 'Sound Design', { cut: 346, res: 0.64, env: 1, A: 0.001, D: 0.2, S: 0, R: 0.1, ch: 0, level: 0.69 }],
    ['Siren', 'FX', 'Sound Design', { saw: 0, pulse: 1, pwm: 0, cut: 3000, env: 0, vib: 1, rate: 1.5, wave: 'tri', S: 1, R: 0.3, mono: 'ml', ch: 0, level: 0.74 }],
    ['Ocean Surf', 'FX', 'Ambient', { saw: 0, noise: 1, cut: 252, res: 0.14, env: 0, flfo: 0.7, rate: 0.08, A: 2, S: 1, R: 3, hpf: 30, ch: 3, level: 0.41 }],
    ['UFO Wobble', 'FX', 'Sound Design', { saw: 0, pulse: 1, pwm: 0.5, pwmMod: true, cut: 1410, res: 0.47, env: 0, flfo: 0.7, rate: 5, vib: 0.4, S: 1, R: 0.5, ch: 2, level: 0.35 }],
  ];

  window.PRESETS = LIST.map(([name, cat, genre, o], i) => ({ num: i + 1, name, cat, genre, values: toPanel(o) }));
  window.PRESET_CATEGORIES = [...new Set(LIST.map(x => x[1]))];
})();
