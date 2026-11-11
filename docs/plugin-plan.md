# Plan: Halden 6 as an open-source VST3 plugin for Ableton Live

Status: plan only, nothing built yet. Written 2026-11-10.

## Goal

- **Halden 6 runs as an instrument in Ableton Live on Windows.** Live loads it
  like any other synth, records automation, saves it in the Live set and
  renders it on export.
- **The plugin is open source.** Anyone can read, build and change it.
- **The web version stays.** It keeps working from `index.html`, and both
  versions share as much code as possible so they sound and look the same.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Framework | JUCE 8 | The standard C++ framework for plugins. It can show a web page as the plugin window, so the existing panel is reused. |
| Plugin format | VST3 only | Live on Windows loads VST2 and VST3. The VST2 SDK is no longer available, and Live does not load CLAP. |
| Sound engine | The same `dsp/halden6.dsp`, compiled to C++ | One Faust source for both versions, so there is no second synth to maintain. |
| Panel | The existing HTML panel inside WebView2 (the Edge browser engine built into Windows) | It keeps the skins, the graphs and the scaling. |
| Licence | AGPL-3.0 for the whole repo | JUCE's free licence for open source is AGPLv3, so the plugin must use it. One licence for the whole repo is simpler than two. |
| Repo layout | Web version stays in the root, the plugin goes in `plugin/` | Double-clicking `index.html` and the README links keep working. |
| Installer | `install.ps1` (with `install.cmd` for double-click) builds the plugin from this repo and installs it, asking where | One command from clone to playing in Live. The same script builds the release in CI. |
| Releases | A zipped `.vst3` folder built by GitHub Actions on every tag, using the installer in build-only mode | For people without build tools. No code signing in the first release. |

## What is shared, what is separate

| Part | Web version | Plugin |
|---|---|---|
| `dsp/halden6.dsp` (voices, filter, HPF, chorus) | Compiled to WebAssembly (as now) | Compiled to C++ |
| `panel.js`, `ui.js`, `viz.js`, `backdrop.js`, `styles.css`, `fonts/` | Used as they are | Used as they are, loaded into WebView2 |
| `presets.js`, factory arp patterns | Read by the web UI | Turned into C++ data by a build script, so the list exists once |
| `synth.js` (audio glue) | Talks to the browser's audio engine | Replaced by `plugin/web/bridge.js`, which has the same `window.Synth` interface and sends everything to C++ |
| `arp.js` | Pattern editor **and** clock | Pattern editor only; the clock runs in C++ |
| Value mappings (fader position to Hz, seconds) | JavaScript in `synth.js` | C++ copy, checked against the JavaScript one |
| Comment mode | Kept | Left out (development tool) |

**Two pieces of logic will exist twice: the value mappings and the arp clock.**
The plugin has to make sound without the panel, so the mappings and the arp
clock must run in C++. Where a mapping only shapes the sound, move it into
`halden6.dsp`, so both versions get it from the same Faust code. For the rest,
a small check script compares JavaScript and C++ results.

## Phases

Sizes are relative (S, M, L), not time estimates.

### Phase 0: Open-source groundwork (S)

- Add `LICENSE` (AGPL-3.0) and `THIRD-PARTY.md`. The latter lists Faust
  libraries (MIT / STK-4.3), junologue-chorus (MIT), fonts (SIL OFL),
  faustwasm (LGPL-2.1, web version only), JUCE (AGPLv3), the VST3 SDK
  (MIT since 3.8), and the WebView2 SDK (check its licence).
- Keep `reference/` out of git (already in `.gitignore`).
- Keep "Juno" out of the plugin's name and vendor fields. The README
  disclaimer already covers the Roland trademark.
- Read Steinberg's trademark rules before using the word "VST" or its logo
  in the README or the release.
- Install the toolchain: Visual Studio 2022 Build Tools (C++ workload),
  CMake, Git, JUCE 8 as a git submodule, the native Faust compiler,
  pluginval (a free tool that stress-tests plugins).

**Done when:** the repo has a licence, and a JUCE example plugin builds and loads in Live.

### Phase 1: Sound in Live (M)

- Compile `halden6.dsp` to a C++ class (`faust -lang cpp`) for the voice and the effect.
- Wrap it in a JUCE instrument (MIDI in, stereo out, no audio in) with 6-voice
  allocation, like `synth.js` does today.
- Use JUCE's generic slider window, no custom panel yet.

- Write the first version of the installer (see below), so every later phase is
  tested the way users will install it.

**Done when:** `install.cmd` builds and installs the plugin, Live lists Halden 6
under instruments, a MIDI clip plays it, and it sounds like the web version
playing the same patch.

### Phase 2: Parameters, state, output stage (M)

- Define every panel control as a DAW parameter. Its ID is taken from
  `panel.js`, and a clear name is used for Live's automation list (for example "VCF Freq").
  **Parameter IDs never change after the first release**, otherwise old Live sets break.
- Port the value mappings from `synth.js` to C++. The output gain and the limiter
  already live in `halden6.dsp`, so the plugin gets them for free.
  from `synth.js` to C++ (or into Faust).
- Mono and glide (ML, G-ML), velocity, pitch wheel from MIDI.
- Save and restore the full patch in the Live set.

**Done when:** automation recorded in Live plays back. A saved Live set reopens
with the same sound. The check script shows equal JavaScript and C++ mappings.

### Phase 3: The panel inside the plugin (L)

- Show the panel in JUCE's `WebBrowserComponent` with WebView2, and package
  the panel files inside the plugin.
- Set the WebView2 user data folder to a writable location (for example
  `%LOCALAPPDATA%\Halden6`). The default location next to Live's program files
  is not writable and makes WebView2 fail.
- Write `plugin/web/bridge.js` with the same interface as `window.Synth`, and
  connect each control to its parameter (JUCE's `WebSliderRelay` and toggle
  relays). Drags must start and end a "gesture", so Live's undo and automation
  recording work.
- Send DAW changes back to the panel, so automation moves the faders.
- Send the output wave to the panel about 30 times per second for the live scope.
- The plugin window can be resized; the panel's existing scaling does the rest.
- On-screen keys send notes to the C++ side.

**Done when:** every control works both ways, the window resizes cleanly, and
the web version still works unchanged.

**Stop and decide here.** After phase 3, Halden 6 is a playable plugin with its own
panel. Decide then whether the arpeggiator port is worth the effort.

### Phase 4: Arpeggiator in C++ (L)

- Port the clock, the Arp and Pattern modes, latch, swing and gate from `arp.js`
  to the audio callback, with notes placed to the exact sample.
- Follow Live's tempo and play position: steps line up with Live's bars, and
  loops and tempo changes stay in time. When Live is stopped, the arp runs on
  at Live's tempo, so you can jam without starting the transport.
- Never use a wall clock. Live renders faster than real time when you export or
  freeze, and only a clock driven by the audio stream stays in time then.
- `arp.js` stays the editor. It sends the pattern to C++ and shows the
  playhead it gets back. Recording, slots and the current pattern are saved in the Live set.

**Done when:** the arp stays on the grid while Live plays, loops, changes tempo,
exports and freezes, and the exported audio matches what you heard.

### Phase 5: Presets (S)

- A build script turns `presets.js` and the factory arp patterns into C++ data.
- The presets show in the panel's preset library and in Live's preset menu for the plugin.

**Done when:** all 100 sounds and 7 patterns load in the plugin, and the web version uses the same source files.

### Phase 6: Test in Live and release (M)

- Run pluginval at strictness level 5 or higher.
- Work through the Live checklist below.
- GitHub Actions on `windows-latest`: run `install.ps1 -BuildOnly` on every tag
  and attach `Halden6-vst3-<version>.zip` to the GitHub release.
- README: an install section with both ways in: `install.cmd` from a clone,
  or the release zip unzipped to `C:\Program Files\Common Files\VST3`.

**Done when:** on a fresh Windows machine with Live, both `install.cmd` and the
release zip end with Halden 6 playing in Live.

## Installer: build from source and install

One script, `install.ps1` in the repo root, with `install.cmd` next to it so a
double-click works without changing PowerShell's execution policy. It runs as
the normal user and asks for admin rights only for the final copy into a
system folder.

### Questions it asks

Each question has a default (press Enter) and a matching flag, so a repeat
install or CI runs without questions (`-Yes` takes all defaults).

| Question | Choices (default first) | Flag |
|---|---|---|
| Which version to build? | The current checkout · the latest release tag · a tag or branch you name | `-Ref` |
| Install as? | **Halden 6** (stable) · **Halden 6 Dev**, a separate plugin with its own ID that sits next to the stable one in Live | `-Channel Stable\|Dev` |
| Where to install? | VST3 system folder `C:\Program Files\Common Files\VST3` (needs admin, Live finds it by default) · a custom folder you name (no admin, but you must set it as Live's one VST3 custom folder) | `-Target` |
| An existing install was found. Replace it? | Replace · cancel | `-Yes` |
| Run pluginval after the build? | No · yes | `-Validate` |

### What it does, in order

1. **Checks the machine.** Windows 10 or 11, the WebView2 runtime present,
   and Visual Studio 2022 Build Tools (C++ workload), CMake and Git. If a tool
   is missing, it offers to install it with `winget` and stops if you say no.
2. **Gets the source.** Checks out the chosen version and updates the JUCE
   submodule (pinned version).
3. **Builds.** Runs CMake in Release mode into `build/`, with the plugin name
   and ID set by the channel.
4. **Validates (optional).** Runs pluginval against the fresh build.
5. **Checks that Live is closed.** Live locks loaded plugin files. If Live is
   running, the script asks you to close it and waits.
6. **Installs.** Shows the target path, then copies `Halden 6.vst3` (or
   `Halden 6 Dev.vst3`) there. It only ever replaces its own `.vst3` folder.
7. **Records the install** in `%LOCALAPPDATA%\Halden6\install.json`: version,
   commit, channel, path and date.
8. **Prints the Live steps.** Preferences > Plug-ins > turn on "Use VST3 Plug-In
   System Folders" (or set the custom folder), then Rescan. The script does not
   change Live's settings itself.

`install.ps1 -Uninstall` removes the plugin from the path in `install.json`.
`install.ps1 -BuildOnly` stops after step 4 and writes the release zip (used by CI).

### Keep the build dependencies small

- **Commit the Faust-generated C++**, like `dsp/halden6-dsp.js` is committed
  today. Then the installer does not need the Faust compiler, and CI checks
  that the generated file matches `halden6.dsp`.
- **Commit the generated parameter and preset data** for the same reason, so
  the installer does not need Node.js.
- Build tools take several GB, which is why the release zip stays as the
  route for people who only want to play.

## Ableton Live test checklist

| Test | Why |
|---|---|
| Insert, remove the last copy, insert again | An older JUCE forum report shows a crash on re-insert in Live |
| 8 copies in one Live set | Each copy runs its own WebView2, so watch memory and CPU |
| Windows display scaling at 100 %, 150 % and 200 %, with Live's "Auto-Scale Plug-In Window" on and off | High-DPI issues with WebView2 in Live are known |
| Record automation from the panel, then undo | Checks that the gestures reach Live |
| Save the set, close Live, reopen it | Checks that the patch, the arp pattern and the slots come back |
| Export and freeze a track with the arp running | Checks the arp at faster-than-real-time rendering |
| Loop a 1-bar region, change tempo while playing | Checks arp sync |
| 44.1, 48 and 96 kHz sample rates; buffer sizes from 64 to 2048 | Checks the sound and the timing at every setting |
| Close the plugin window while playing | Sound and arp keep running without the panel |

## Risks

- **WebView2 inside Live is the biggest unknown.** If it misbehaves, the fallback is
  JUCE's static WebView2 linking, or a native JUCE panel for the plugin only.
- **The arp port is the largest piece of new code.** Keep its rules small and
  write them down, so the JavaScript and C++ versions don't drift apart.
- **AGPL is a strong copyleft licence.** Anyone who ships a changed version must
  publish their source. You can still relicense your own code later, but not
  code from outside contributors unless they agree.

## Optional, later

- Host the web version on GitHub Pages. Served over HTTPS, it gets the
  lower-latency audio path automatically.
- MIDI output from the arp, so it can play other instruments in Live.

## Open questions

- Which Live version will you test with (11 or 12)?
- Does the WebView2 SDK licence allow static linking in an AGPL project? Check before phase 3.

## Sources

- [JUCE 8 licence: AGPLv3 or commercial](https://forum.juce.com/t/juce8-license-and-open-source-projects/60987)
- [VST 3 SDK under MIT since 3.8](https://steinbergmedia.github.io/vst3_dev_portal/pages/VST+3+Licensing/VST3+License)
- [JUCE WebView2 options, custom user data folder for plugins](https://docs.juce.com/master/classWebBrowserComponent_1_1Options_1_1WinWebView2.html)
- [WebView2 and high-DPI scaling in Ableton (JUCE forum)](https://forum.juce.com/t/bug-7-0-3-win-ableton-webview2-and-custom-scaling-issue-high-dpi/55606)
- [WebBrowserComponent crash on re-insert (JUCE forum)](https://forum.juce.com/t/webbrowsercomponent-crashing-on-windows-when-re-inserting-plugin/44067)
- [Static WebView2 linking (JUCE forum)](https://forum.juce.com/t/ie-is-still-loading-instead-of-webview2-on-windows-10/63829)
- [Using VST plug-ins on Windows, system and custom VST3 folders (Ableton)](https://help.ableton.com/hc/en-us/articles/209071729)
- [Only one VST3 custom folder in Live (Ableton forum)](https://forum.ableton.com/viewtopic.php?p=1800417)
