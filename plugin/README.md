# Halden 6 VST3 plugin

The same synth as the web version, as a VST3 instrument for Ableton Live on
Windows. Phases 1 and 2 of [../docs/plugin-plan.md](../docs/plugin-plan.md) are
built: it plays from MIDI, every sound control is a Live parameter, and the
patch is saved in the Live set. The window is JUCE's plain parameter list; the
real Halden 6 panel comes in phase 3.

## Install

From a clone of this repository, double-click `install.cmd` in the repository
root. It checks for Git, CMake and the Visual Studio 2022 C++ tools (and offers
to install them with winget), builds the plugin and copies it to your VST3
folder. Then in Live: Settings > Plug-Ins, turn on the VST3 system folder,
Rescan.

## What is in here

| Path | What it is |
|---|---|
| `Source/Engine.*` | The sound engine without JUCE: six Faust voices, the effect, voice allocation and the ML / G-ML note logic. A port of `synth.js` and faustwasm's voice pool. |
| `Source/Mappings.h` | Fader position to Hz, seconds and cents. A copy of `dspValues()` in `synth.js`. |
| `Source/PluginProcessor.*` | The JUCE plugin: MIDI in, parameters, saved state. |
| `Source/FaustGlue.h` | The few Faust base classes the generated code needs. |
| `Source/generated/` | Generated, committed: `Parameters.h` from `panel.js`, `Halden6Voice.h` and `Halden6Effect.h` from `dsp/halden6.dsp`. |
| `tools/generate.mjs` | Writes `Source/generated/`. |
| `tools/check.mjs` | Compares the plugin with the web version: mappings and sound. |
| `tools/hosttest.cpp` | Loads the built `.vst3` like a DAW and plays it. |
| `JUCE/` | JUCE 8.0.9, git submodule. |

## Parameters

Every panel control that shapes the sound is a parameter, named for Live's
automation list ("VCF Freq", "ENV A"). Its ID is the control id from
`panel.js`. **Never rename or remove an ID after the first release**, or saved
Live sets lose that setting. Not parameters: Panic (send MIDI All Notes Off),
the pitch wheel (MIDI pitch bend) and the arpeggiator with its BPM (phase 4).
LFO tempo sync follows Live's tempo.

## After changing the sound or the panel

```
cd dsp && npm install && cd ..           # once
node plugin/tools/generate.mjs           # panel.js changed: parameters
node plugin/tools/generate.mjs --dsp     # halden6.dsp changed: needs the Faust compiler on PATH
node plugin/tools/check.mjs              # plugin and web version still agree?
```

If you change a mapping in `synth.js`, change `Source/Mappings.h` the same way;
`check.mjs` fails until they agree.

## Build and test by hand

```
git submodule update --init --depth 1 plugin/JUCE
cmake -S plugin -B build -DHALDEN6_HOST_TEST=ON
cmake --build build --config Release
build/Halden6HostTest_artefacts/Release/Halden6HostTest "build/Halden6_artefacts/Release/VST3/Halden 6.vst3"
```

`-DHALDEN6_CHANNEL=Dev` builds "Halden 6 Dev", a separate plugin with its own ID.
