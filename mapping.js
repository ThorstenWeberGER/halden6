// Fader positions to real units (Hz, seconds, cents), and readout text.
// Shared by synth.js (the browser sound engine) and plugin/web/bridge.js (the
// plugin), so the graphs and readouts show what you hear in both. The plugin's
// sound engine has a C++ copy of dspValues() in plugin/Source/Mappings.h;
// plugin/tools/check.mjs keeps the two equal.

window.HaldenMapping = function (P) {
  const TEMPO_BEATS = [0, 4, 2, 1, 0.5, 0.25]; // '----', 1/1, 1/2, 1/4, 1/8, 1/16
  const OUT_MAKEUP = 5.1; // +14 dB: the old +12 dB plus the ~2 dB the browser compressor used to add

  const expMap = (v, min, max) => min * Math.pow(max / min, v);
  const attack = () => expMap(P.envA, 0.001, 3);
  const decay = () => expMap(P.envD, 0.005, 10);
  const release = () => expMap(P.envR, 0.005, 10);
  const cutoff = () => expMap(P.vcfFreq, 30, 18000);
  const hpfHz = () => expMap(P.hpfFreq, 10, 1500);
  const lfoRateHz = () => P.lfoTempo > 0
    ? ((P.bpm || 120) / 60) / TEMPO_BEATS[P.lfoTempo]
    : expMap(P.lfoRate, 0.1, 20);
  // Filter feedback for a resonance setting, as in halden6.dsp (junoVCF)
  const resK = () => 4.2 * Math.pow(Math.sin(Math.PI / 2 * P.vcfRes), 1.5);

  // Faust control values, in the units halden6.dsp expects
  function dspValues() {
    return {
      pitchCents: P.tune * 100 + P.pitchWheel * P.bendDco * 1200,
      glide: P.gml ? 0.08 : 0,
      sawOn: P.dcoSaw, pulseOn: P.dcoPulse, subOn: P.dcoSub,
      subLevel: P.dcoSubLevel, noiseLevel: P.dcoNoise,
      pwmAmt: P.dcoPwm * 0.45,
      pwmMode: P.dcoPwmMod === 1 ? 0 : (P.dcoPwmSource === 0 ? 1 : 2),
      lfoRate: lfoRateHz(), lfoWave: P.lfoWave, lfoDelay: P.lfoDelay * 3,
      lfoRetrig: P.lfoTrig === 0 ? 1 : 0, lfoPitch: P.dcoLfo * P.dcoLfo * 600,
      cutoff: cutoff(), res: P.vcfRes,
      envAmt: (P.vcfEnvPolarity === 0 ? 1 : -1) * P.vcfEnv * 7200,
      lfoFilt: P.vcfLfo * P.vcfLfo * 4800, kybd: P.vcfKybd,
      bendVcf: P.pitchWheel * P.bendVcf * 4800,
      attack: attack(), decay: decay(), sustain: P.envS, release: release(),
      vcaGate: P.vcaMode, velEnv: P.velocityEnv,
      hpf: hpfHz(),
      chorusMode: P.chorus1 && P.chorus2 ? 3 : P.chorus2 ? 2 : P.chorus1 ? 1 : 0,
      revMix: P.revMix * P.revMix, revTime: expMap(P.revLength, 0.3, 12),
      texture: P.texture, fm: P.fm,
      // +14 dB makeup (one note peaks around -24 dBFS, too quiet), VCA level and
      // volume. Chords go over full scale; the limiter in halden6.dsp catches them.
      outGain: OUT_MAKEUP * P.vcaLevel * 1.2 * P.volume * P.volume,
    };
  }

  // Readout text for a control value, in real units where it helps
  function format(id, v) {
    const hz = x => x >= 1000 ? (x / 1000).toFixed(1) + ' kHz' : x.toFixed(x < 10 ? 2 : 0) + ' Hz';
    const sec = x => x < 1 ? Math.round(x * 1000) + ' ms' : x.toFixed(2) + ' s';
    switch (id) {
      case 'lfoRate': return P.lfoTempo > 0 ? 'tempo sync' : hz(expMap(v, 0.1, 20));
      case 'lfoDelay': return sec(v * 3);
      case 'envA': return sec(expMap(v, 0.001, 3));
      case 'envD': case 'envR': return sec(expMap(v, 0.005, 10));
      case 'envS': return Math.round(v * 100) + ' %';
      case 'vcfFreq': return hz(expMap(v, 30, 18000));
      case 'hpfFreq': return hz(expMap(v, 10, 1500));
      case 'tune': return (v >= 0 ? '+' : '') + Math.round(v * 100) + ' ct';
      case 'bendDco': return (v * 12).toFixed(1) + ' st';
      case 'pitchWheel': return (v >= 0 ? '+' : '') + v.toFixed(2);
      case 'arpGate': return Math.round(5 + v * 95) + ' %';
      case 'revMix': case 'texture': case 'fm': return Math.round(v * 100) + ' %';
      case 'revLength': return sec(expMap(v, 0.3, 12));
      case 'arpSwing': return Math.round(v * 100) + ' %';
      default: return (v * 10).toFixed(1);
    }
  }

  return {
    dspValues, format,
    // Value mappings for the graphs in viz.js
    map: {
      attack, decay, release, cutoff, hpfHz, lfoRateHz,
      pulseWidth: () => (P.dcoPwmMod === 0 ? 0.5 : 0.5 - P.dcoPwm * 0.45),
      resK,
    },
  };
};
