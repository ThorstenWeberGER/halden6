# Halden 6 VST3 plugin

The same synth as the web version, as a VST3 instrument for Ableton Live on
Windows. Phases 1 to 5 of [../docs/plugin-plan.md](../docs/plugin-plan.md) are
built: it plays from MIDI, every control is a Live parameter, the patch is
saved in the Live set, the window is the Halden 6 panel, the 100 factory
presets are in Live's preset menu, and the arpeggiator runs in step with Live.
Drag the window corner to any size; the panel reflows as in the browser, and
the size is saved in the Live set.

## Arpeggiator

The arp's clock runs in the plugin (`Source/Arp.*`), with the same rules as
`arp.js`; they are written down at the top of `Source/Arp.h`. While Live plays,
steps sit on Live's grid and follow loops and tempo changes. When Live is
stopped, the arp runs on at Live's tempo from the key press. It counts samples,
not clock time, so export and freeze play exactly what you heard. The arp
controls are Live parameters; the pattern and the 8 slots are saved in the
Live set. The panel's BPM display shows Live's tempo. Step recording takes
notes from the panel's keys and from Live's MIDI.

## The panel inside the plugin

The plugin shows the same `index.html` as the web version in a web view
(WebView2 on Windows). The panel files are packed into the plugin at build
time. `web/bridge.js` takes the place of `synth.js`: it offers the panel the
same `window.Synth` interface, but sends every change to the plugin and shows
what Live changes (automation, undo, a loaded set). A drag is one gesture, so
Live records it as automation and undoes it in one step.

The preset shown in the panel and the one in Live's menu are the same, and it
is saved with the Live set. Choosing a preset changes the sound only, as in the
panel: volume stays.

Left out in the plugin: comment mode. The skin is remembered per computer,
not per Live set.

## Install

See the main [README](../README.md#the-plugin-for-ableton-live) and the [guide](../docs/guide.md#halden-6-in-ableton-live-vst3-plugin-windows).

## Releasing

First raise the version shown in the panel (`index.html`, "poly synth · v0.2")
and the default in `CMakeLists.txt`. Then on GitHub open **Actions > Plugin >
Run workflow**, choose `main` and enter the version, e.g. `0.2.0`. Or push a tag (`git tag v0.1.1 && git push origin v0.1.1`).

GitHub Actions bakes that version into the plugin, builds on Windows, runs
pluginval and the checks, creates the tag if needed, and publishes
`Halden6-vst3-0.1.1.zip` as a GitHub release. The zip holds the plugin,
`LICENSE.txt`, `THIRD-PARTY.md` and a `README.txt` with the install steps and
the source link the AGPL asks for. A release made by hand on github.com gets
the zip attached instead. No file needs editing for a release; the version in
`CMakeLists.txt` is only the default for local builds.

Every push also builds the zip (kept with the Actions run) and runs pluginval
at strictness level 5.

## What is in here

| Path | What it is |
|---|---|
| `Source/Engine.*` | The sound engine without JUCE: six Faust voices, the effect, voice allocation and the ML / G-ML note logic. A port of `synth.js` and faustwasm's voice pool. |
| `Source/Arp.*` | The arpeggiator's clock and rules. |
| `Source/Mappings.h` | Fader position to Hz, seconds and cents. A copy of `dspValues()` in `mapping.js`. |
| `Source/PluginProcessor.*` | The JUCE plugin: MIDI in, parameters, saved state. |
| `Source/PluginEditor.*` | The plugin window: the web panel, resizing, messages both ways. |
| `web/bridge.js` | The panel's link to the plugin (replaces `synth.js`). |
| `Source/FaustGlue.h` | The few Faust base classes the generated code needs. |
| `Source/generated/` | Generated, committed: `Parameters.h` from `panel.js`, `Presets.h` from `presets.js`, `ArpPatterns.h` from `arp-patterns.js`, `Halden6Voice.h` and `Halden6Effect.h` from `dsp/halden6.dsp`. |
| `tools/generate.mjs` | Writes `Source/generated/`. |
| `tools/check.mjs` | Compares the plugin with the web version (mappings, sound) and checks the arp's rules sample by sample. |
| `tools/hosttest.cpp` | Loads the built `.vst3` like a DAW and plays it. |
| `tools/paneltest.cpp` | Opens the plugin window and drives the panel both ways. |
| `JUCE/` | JUCE 8.0.9, git submodule. |

## Parameters

Every panel control that shapes the sound is a parameter, named for Live's
automation list ("VCF Freq", "ENV A"). Its ID is the control id from
`panel.js`. **Never rename or remove an ID after the first release**, or saved
Live sets lose that setting. Not parameters: Panic (the panel button, or MIDI All Notes Off),
the pitch wheel (MIDI pitch bend) and the arpeggiator with its BPM (phase 4).
LFO tempo sync follows Live's tempo.

## After changing the sound or the panel

```
cd dsp && npm install && cd ..           # once
node plugin/tools/generate.mjs           # panel.js, presets.js or arp-patterns.js changed
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

The panel test (`build/Halden6PanelTest_artefacts/Release/Halden6PanelTest`)
needs a display. On Linux, JUCE 8.0.9's WebKitGTK bridge drops messages larger
than a pipe buffer, so the panel only loads with a patched JUCE copy
(`-DHALDEN6_JUCE_DIR=...`); JUCE 9 fixes this. Windows uses WebView2 directly
and is not affected. Linux is a test platform here, not a release target.
