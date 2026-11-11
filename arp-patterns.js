// Arpeggiator patterns: the example shown on first open and the 80s factory
// patterns. Shared by arp.js (browser and plugin panel) and the plugin's C++
// (plugin/tools/generate.mjs turns this file into Source/generated/ArpPatterns.h).
//
// Factory patterns in typical 80s styles. These are original patterns
// written for this synth, not transcriptions of specific songs.
// Step: [note, velocity, gate, tie] or null for a rest. Notes are MIDI
// numbers written for C (C3 = 48, C4 = 60); the held key transposes them.
// rate: index into the Rate options (3 = 1/16). bpm is a suggestion; inside
// the plugin the tempo is Live's.

window.ARP_PATTERNS = {
  example: {
    length: 16,
    steps: [
      [60, 1, 0.5], [60, 0.55, 0.3], [67, 0.8, 0.5], [72, 0.9, 0.6], null, [70, 0.7, 0.4], [67, 0.75, 0.5], [65, 0.6, 0.3],
      [60, 1, 0.5], [63, 0.6, 0.4], [67, 0.85, 1, true], [67, 0.6, 0.5], null, [72, 0.9, 0.4], [70, 0.65, 0.4], [67, 0.7, 0.8],
    ],
  },
  factory: [
    { name: 'Italo Octaves', bpm: 118, rate: 3, swing: 0, info: 'octave-jumping disco bass, C - Ab - Bb',
      steps: [
        [48, 0.95, 0.4], [60, 0.6, 0.3], [48, 0.8, 0.4], [60, 0.65, 0.3], [48, 0.9, 0.4], [60, 0.6, 0.3], [48, 0.8, 0.4], [60, 0.65, 0.3],
        [44, 0.95, 0.4], [56, 0.6, 0.3], [44, 0.8, 0.4], [56, 0.65, 0.3], [46, 0.9, 0.4], [58, 0.6, 0.3], [46, 0.8, 0.4], [58, 0.7, 0.3],
      ] },
    { name: 'Hi-NRG Gallop', bpm: 128, rate: 3, swing: 0, info: 'galloping one-note bass, up a third at the end',
      steps: [
        [48, 1, 0.4], null, [48, 0.6, 0.3], [48, 0.75, 0.3], [48, 1, 0.4], null, [48, 0.6, 0.3], [48, 0.75, 0.3],
        [48, 1, 0.4], null, [48, 0.6, 0.3], [48, 0.75, 0.3], [51, 1, 0.4], null, [51, 0.6, 0.3], [53, 0.8, 0.3],
      ] },
    { name: 'Synthpop Arp', bpm: 112, rate: 3, swing: 0, info: 'C minor and Ab major broken chords',
      steps: [
        [60, 1, 0.5], [63, 0.6, 0.4], [67, 0.7, 0.4], [72, 0.8, 0.4], [67, 0.9, 0.5], [63, 0.6, 0.4], [60, 0.7, 0.4], [63, 0.65, 0.4],
        [56, 1, 0.5], [60, 0.6, 0.4], [63, 0.7, 0.4], [68, 0.8, 0.4], [63, 0.9, 0.5], [60, 0.6, 0.4], [56, 0.7, 0.4], [60, 0.65, 0.4],
      ] },
    { name: 'Electro Funk', bpm: 106, rate: 3, swing: 0.35, info: 'syncopated minor bass with swing',
      steps: [
        [48, 1, 0.3], null, null, [48, 0.7, 0.2], null, [51, 0.8, 0.3], [53, 0.75, 1, true], null,
        [48, 0.9, 0.3], null, [55, 0.8, 0.3], null, [58, 0.85, 0.4], null, [55, 0.7, 0.3], [53, 0.6, 0.3],
      ] },
    { name: 'New Wave Drive', bpm: 136, rate: 1, swing: 0, info: 'straight eighths, root then fifth and seventh',
      steps: [
        [48, 0.95, 0.7], [48, 0.6, 0.7], [48, 0.85, 0.7], [48, 0.6, 0.7], [48, 0.85, 0.7], [48, 0.6, 0.7], [55, 0.8, 0.7], [58, 0.75, 0.7],
        [46, 0.95, 0.7], [46, 0.6, 0.7], [46, 0.85, 0.7], [46, 0.6, 0.7], [46, 0.85, 0.7], [46, 0.6, 0.7], [53, 0.8, 0.7], [55, 0.75, 0.7],
      ] },
    { name: 'Night Drive', bpm: 96, rate: 3, swing: 0, info: 'moody soundtrack sequence, Cm9 to Bb',
      steps: [
        [60, 1, 0.5], [67, 0.6, 0.4], [72, 0.75, 0.4], [75, 0.7, 0.5], [74, 0.9, 0.5], [72, 0.6, 0.4], [67, 0.7, 0.4], [63, 0.6, 0.5],
        [58, 1, 0.5], [65, 0.6, 0.4], [70, 0.75, 0.4], [74, 0.7, 0.5], [72, 0.9, 0.5], [70, 0.6, 0.4], [65, 0.7, 0.4], [62, 0.6, 0.6],
      ] },
    { name: 'Minimal Wave', bpm: 124, rate: 1, swing: 0, length: 8, info: 'eight-step cold-wave loop',
      steps: [
        [60, 1, 0.2], [60, 0.6, 0.8], [63, 0.8, 0.2], [60, 0.6, 0.6], [67, 0.9, 0.2], [60, 0.6, 0.8], [65, 0.8, 0.3], [63, 0.7, 0.9],
        null, null, null, null, null, null, null, null,
      ] },
  ],
};
