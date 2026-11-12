// Panel definition: one entry per section and control from reference/original-panel.png.
// The UI and the sound engine both read from this list, so a new control
// only needs to be added here (plus its sound logic in synth.js).
//
// Control types:
//   slider  vertical fader, value 0..1
//   knob    rotary, value 0..1 (or -1..1 when bipolar)
//   switch  2-position lever, value = index into `options`
//   toggle  on/off button with LED
//   select  click to cycle through `options`
//   stepper number with - / +
//   button  momentary action
//   wheel   pitch wheel, -1..1, springs back to 0
//   tempo   BPM display: drag or scroll to change, TAP button
//
// Rows 1 and 2 are the main panel; rows 'arp1' and 'arp2' live in the
// fold-out arpeggiator. A section with `custom` is drawn by its own code.
// `graph` adds a live graph at the top of the section (see viz.js).
//
// Controls next to each other with the same `group` stay side by side; a
// section's `stack` lists groups whose controls sit on top of each other.
// A section with `rows: true` stacks its groups as rows, top to bottom, and
// `weight` sets its width (otherwise it follows its controls).
// `caption` puts a line of text under a toggle, and `paramName` is the name
// the plugin shows in the DAW (otherwise "Section Label").

window.PANEL = [
  {
    id: 'control', title: 'Control', accent: 'blue', row: 1, weight: 3.2, stack: ['right'],
    controls: [
      { id: 'velocityEnv', type: 'slider', label: 'Velocity Env', value: 0 },
      { id: 'voices', type: 'stepper', label: 'Voices', min: 1, max: 6, value: 6, group: 'right' },
      { id: 'panic', type: 'button', label: 'Panic', group: 'right' },
    ],
  },
  {
    id: 'chorus', title: 'Effects', accent: 'blue', row: 1, weight: 2.6, rows: true,
    controls: [
      { id: 'chorus1', type: 'toggle', label: 'I', caption: 'Chorus I', paramName: 'Chorus I', color: 'yellow', value: 1, group: 'chorus' },
      { id: 'chorus2', type: 'toggle', label: 'II', caption: 'Chorus II', paramName: 'Chorus II', color: 'orange', value: 0, group: 'chorus' },
      { id: 'revMix', type: 'knob', label: 'Reverb', paramName: 'Reverb Amount', value: 0, group: 'reverb' },
      { id: 'revLength', type: 'knob', label: 'Length', paramName: 'Reverb Length', value: 0.5, group: 'reverb' },
      { id: 'texture', type: 'knob', label: 'Texture', paramName: 'Texture', value: 0, group: 'tone' },
      { id: 'fm', type: 'knob', label: 'FM', paramName: 'FM', value: 0, group: 'tone' },
    ],
  },
  {
    id: 'lfo', title: 'LFO', accent: 'red', row: 1, graph: 'lfo',
    controls: [
      { id: 'lfoRate', type: 'slider', label: 'Rate', value: 0.45 },
      { id: 'lfoDelay', type: 'slider', label: 'Delay Time', value: 0 },
      { id: 'lfoTrig', type: 'switch', label: 'Trig Mode', options: ['Auto', 'Off'], value: 1 },
      { id: 'lfoWave', type: 'select', label: 'Wave', options: ['sin', 'tri', 'saw', 'sqr'], value: 0 },
      { id: 'lfoTempo', type: 'select', label: 'Tempo', options: ['----', '1/1', '1/2', '1/4', '1/8', '1/16'], value: 0 },
    ],
  },
  {
    id: 'dco', title: 'DCO', accent: 'red', row: 1, graph: 'wave',
    controls: [
      { id: 'dcoLfo', type: 'slider', label: 'LFO', value: 0 },
      { id: 'dcoPwm', type: 'slider', label: 'PWM', value: 0.3 },
      { id: 'dcoPwmSource', type: 'switch', label: 'PWM Src', options: ['LFO', 'ENV'], value: 0 },
      { id: 'dcoPwmMod', type: 'switch', label: 'PWM Mod', options: ['On', 'Off'], value: 0 },
      { id: 'dcoPulse', type: 'toggle', label: 'Pulse', icon: 'pulse', color: 'cream', value: 0 },
      { id: 'dcoSaw', type: 'toggle', label: 'Saw', icon: 'saw', color: 'yellow', value: 1 },
      { id: 'dcoSub', type: 'toggle', label: 'Sub', icon: 'sub', color: 'orange', value: 0 },
      { id: 'dcoSubLevel', type: 'slider', label: 'Sub Osc', value: 0.6 },
      { id: 'dcoNoise', type: 'slider', label: 'Noise', value: 0 },
    ],
  },
  {
    id: 'perf', title: 'Performance', accent: 'grey', row: 2,
    controls: [
      { id: 'bendDco', type: 'slider', label: 'Bend DCO', value: 0.17 },
      { id: 'bendVcf', type: 'slider', label: 'Bend VCF', value: 0 },
      { id: 'tune', type: 'knob', label: 'Tune', bipolar: true, value: 0 },
      { id: 'volume', type: 'knob', label: 'Volume', value: 0.7 },
      { id: 'pitchWheel', type: 'wheel', label: 'Pitch Wheel', value: 0 },
      { id: 'ml', type: 'toggle', label: 'ML', color: 'red', group: 'mono', value: 0 },
      { id: 'gml', type: 'toggle', label: 'G-ML', color: 'red', group: 'mono', value: 0 },
    ],
  },
  {
    id: 'hpf', title: 'HPF', accent: 'red', row: 2,
    controls: [
      { id: 'hpfFreq', type: 'slider', label: 'Freq', value: 0 },
    ],
  },
  {
    id: 'vcf', title: 'VCF', accent: 'red', row: 2, graph: 'filter',
    controls: [
      { id: 'vcfFreq', type: 'slider', label: 'Freq', value: 0.62 },
      { id: 'vcfRes', type: 'slider', label: 'Res', value: 0.15 },
      { id: 'vcfEnvPolarity', type: 'switch', label: 'Env Pol', options: ['+', '−'], value: 0 },
      { id: 'vcfEnv', type: 'slider', label: 'Env', value: 0.35 },
      { id: 'vcfLfo', type: 'slider', label: 'LFO', value: 0 },
      { id: 'vcfKybd', type: 'slider', label: 'Kybd', value: 0.5 },
    ],
  },
  {
    id: 'vca', title: 'VCA', accent: 'red', row: 2,
    controls: [
      { id: 'vcaMode', type: 'switch', label: 'Mode', options: ['Env', 'Gate'], value: 0 },
      { id: 'vcaLevel', type: 'slider', label: 'Level', value: 0.7 },
    ],
  },
  {
    id: 'env', title: 'ENV', accent: 'red', row: 2, graph: 'env',
    controls: [
      { id: 'envA', type: 'slider', label: 'A', value: 0.05 },
      { id: 'envD', type: 'slider', label: 'D', value: 0.45 },
      { id: 'envS', type: 'slider', label: 'S', value: 0.6 },
      { id: 'envR', type: 'slider', label: 'R', value: 0.35 },
    ],
  },
  // ---------- arpeggiator (fold-out panel) ----------
  {
    id: 'arpMain', title: 'ARP', accent: 'blue', row: 'arp1',
    controls: [
      { id: 'arpOn', type: 'toggle', label: 'On', color: 'yellow', value: 0 },
      { id: 'arpMode', type: 'switch', label: 'Mode', options: ['Arp', 'Pattern'], value: 0 },
      { id: 'arpLatch', type: 'toggle', label: 'Latch', color: 'orange', value: 0 },
    ],
  },
  {
    id: 'arpClock', title: 'Clock', accent: 'blue', row: 'arp1',
    controls: [
      { id: 'bpm', type: 'tempo', label: 'BPM', min: 40, max: 240, value: 120 },
      { id: 'arpRate', type: 'select', label: 'Rate', options: ['1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32'], value: 3 },
      { id: 'arpSwing', type: 'knob', label: 'Swing', value: 0 },
    ],
  },
  {
    id: 'arpPlay', title: 'Arp Mode', accent: 'red', row: 'arp1',
    controls: [
      { id: 'arpOrder', type: 'select', label: 'Order', options: ['up', 'down', 'up-dn', 'random', 'played'], value: 0 },
      { id: 'arpOctaves', type: 'stepper', label: 'Octaves', min: 1, max: 4, value: 1 },
      { id: 'arpGate', type: 'knob', label: 'Gate', value: 0.7 },
    ],
  },
  {
    id: 'arpPattern', title: 'Pattern', accent: 'red', row: 'arp2', custom: 'pattern',
    controls: [],
  },
];
