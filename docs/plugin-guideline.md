# Guideline: building an audio plugin from a web synth

For an AI agent building another plugin the way Halden 6 was built: a web
instrument (HTML panel + Faust DSP) turned into a VST3 for Ableton Live on
Windows, with JUCE 8 and the same panel in a WebView2 window. Read this before
you write code. It records what worked, and every trap we fell into.

Reference implementation: this repository. Start with `README.md` ("How it
fits together"), `docs/plugin-plan.md`, `plugin/README.md`.

---

## 1. Principles

1. **One source of truth per concern.** Sound in one Faust file, controls in
   one panel definition, presets in one data file, arp patterns in one data
   file. The plugin gets C++ generated from them; nothing is typed twice.
2. **Commit generated code, check it in CI.** Users and CI then build without
   Node.js or the Faust compiler, and a `--check` run fails when the generated
   files are stale.
3. **Two products, one behaviour, proven by tests.** Every place where logic
   must exist twice (value mappings, arp rules) gets a test that compares the
   two on random inputs.
4. **The audio engine has no JUCE in it.** Keep DSP, voice allocation, note
   logic and the arp clock in plain C++. Then a 100-line CLI can drive it in
   tests, and the JUCE processor is a thin wrapper.
5. **Count samples, never wall-clock time.** Hosts render faster than real time
   when exporting or freezing. Anything timed (arp, LFO sync, note lengths)
   must advance with the sample count.
6. **Output must not depend on the host's block size.** Make this a test:
   render the same input at 64 and 512 frames per block and require
   bit-identical audio. It found a real bug in our engine (section 4.4).
7. **Measure before fixing.** The original "crackle" bug was found by rendering
   offline and running the real browser output chain, not by guessing.
8. **Plan in phases with "done when" criteria, and stop at decision points.**
   See `docs/plugin-plan.md`: groundwork, sound, parameters/state, panel,
   arp, presets, release.

## 2. Architecture to copy

```
shared source            web version                plugin (JUCE, C++)
--------------           -----------                ------------------
dsp/*.dsp  ──build.mjs──> WebAssembly engine
           ──generate.mjs + native faust──────────> generated/Voice.h, Effect.h ─> Engine
panel.js, presets.js, arp-patterns.js ─generate.mjs> generated/Parameters.h, Presets.h, ArpPatterns.h
index.html, ui.js, viz.js, mapping.js ──> synth.js   (same files, packed as binary data)
                                                   web/bridge.js replaces synth.js
                                                   PluginEditor (WebView2) <-> PluginProcessor
                                                   PluginProcessor -> Arp -> Engine
```

- **Faust**: the voice is `process`, the post-voice chain is `effect`
  (compiled separately with `-pn effect`). Put the output gain and the limiter
  in `effect`, so both products clip-protect identically (section 4.1).
- **Polyphony**: port the web runtime's voice allocator (faustwasm's
  `FaustPolyWebAudioDsp`: free voice, else oldest releasing, else oldest
  playing, with a fade-out/fade-in crossfade on a steal), and the app's note
  logic (voice limit, mono note stack, retrigger) on top of it.
- **Parameters**: one per panel control that shapes the sound; ID = the
  panel's control id, name = "Section Label" for the DAW's automation list.
  Use `juce::ParameterID { id, 1 }`. IDs never change after the first release.
- **Not parameters**: momentary buttons (map to MIDI All Notes Off), the pitch
  wheel (comes from MIDI pitch bend), the tempo (follow the host).
- **State**: APVTS tree + extra properties (preset number, arp pattern JSON,
  slots JSON, editor size, a `stateVersion`).
- **Presets**: `getNumPrograms/setCurrentProgram/getProgramName` from the
  generated table; keep the panel and the host's menu in sync both ways.

## 3. The web panel inside the plugin (WebView2)

- **Bridge, don't rewrite.** The panel talked to `window.Synth`. Write
  `bridge.js` with the same interface that sends everything to C++ and receives
  host changes. Load it instead of the browser engine: the resource provider
  rewrites `index.html` at serve time (and fails loudly if the rewrite no
  longer matches).
- **Messages**: `window.__JUCE__.backend.emitEvent('name', obj)` towards C++,
  `WebBrowserComponent::emitEventIfBrowserIsVisible` towards JS. One event
  name with a `type` field is enough; no need for JUCE's frontend library.
- **First values**: pass current parameters with
  `Options::withInitialisationData`, so the first frame is right. Send a full
  snapshot again when the page reports `ready`.
- **Host -> panel**: parameter listeners only set atomic dirty flags (they run
  on the audio thread during automation); a 30 Hz timer sends the changes.
- **Gestures**: a pointerdown on a control begins a gesture, pointerup ends it;
  a change outside a gesture (click, wheel, preset) is wrapped in its own
  begin/end. Without this, Live's automation recording and undo misbehave.
- **Echo**: the plugin stores 32-bit floats, so the panel's 0.37 comes back as
  0.37000000476. Compare with a tolerance (1e-6), and ignore echoes for the
  control being dragged, or the fader jitters.
- **Packing**: `juce_add_binary_data` keyed by file name; serve by basename.
  Unique basenames required.
- **WebView2 user data folder**: set it to `%LOCALAPPDATA%\<Name>\WebView2`
  (the default next to the host's program files is not writable).
- **Encoding**: serve `index.html` with a UTF-8 byte order mark first. Some
  web views ignore the content type (section 5.3); the BOM always wins.
- **Resizable window**: `setResizable(true, true)`, limits, and store the size
  in the plugin state. Read the saved size *before* `setResizable`, because
  setting up resizing calls `resized()`, which would store the minimum size.
- **Panel features that do not belong in a plugin** (dev tools, "notes for the
  AI" comment mode): hide them with a `.plugin` class the bridge sets.
- **Per-instance data must not live in `localStorage`**: all plugin instances
  share one WebView2 profile. Patch, preset name, patterns go to plugin state.

## 4. Bugs we hit, and the rule each one taught

### 4.1 Crackle on loud chords (web version)
The browser's `DynamicsCompressorNode` used as a "limiter" let chord peaks
through above 0 dBFS; the sound card clipped them. **Rule:** never trust a
compressor as a brick-wall limiter. Put a look-ahead peak limiter in the DSP
(5 ms look-ahead, peak hold, fast attack, ~200 ms release, ceiling -1 dBFS,
hard clip at 1.0 as a last safety net) and test peaks offline across level,
volume, chord size and sample rate. Keep single-note loudness the same as
before when you change the output stage (measure RMS before/after), or users
with quiet headphones lose level.

### 4.2 Delay buffer too short at 96 kHz
A chorus delay sized "enough at 48 kHz" was 7 samples short at 96 kHz.
**Rule:** size every delay line for the highest sample rate you support.

### 4.3 GPL code hiding in a standard library
Faust's `co.limiter_lad_*` is GPL-3.0-only while the rest is MIT/STK.
**Rule:** check the licence of every library function you call; write small
blocks yourself when the licence does not fit.

### 4.4 Output depended on the block size
The engine freed a released voice when a level check ran, and the check ran
after each render call, so its timing depended on how the host split the
audio. A later note then got a different voice. **Rule:** run periodic checks
on fixed sample windows (split render calls at window boundaries).

### 4.5 One-sample jitter in sync'd notes
Arp steps computed as `(stepPpq - blockStartPpq) * samplesPerBeat` rounded
differently depending on where a block started. **Rule:** compute event times
from one fixed anchor (re-anchor only on tempo change, loop or jump), not
from each block's start.

### 4.6 Swing broke grid re-alignment
Re-syncing with `ceil(ppq * stepsPerBeat)` skipped a swung step whose base
time had passed but whose swung time had not. **Rule:** find the first step
whose *swung* time is at or after the position.

### 4.7 Program change on the audio thread
VST3 program changes may arrive on the audio thread. **Rule:** preset state
in atomics, written to the ValueTree only in `getStateInformation`.

## 5. Tool and platform quirks

### 5.1 Faust
- The Faust compiler inside `@grame/faustwasm` has **no C++ backend**
  (`-lang cpp not supported`). Build the native compiler from source
  (`build/backends/light.cmake`, compiler only) or install it.
- Native Faust must use **the same libraries** as the web build: extract them
  from faustwasm's virtual file system (`compiler.fs().readdir('/usr/share/faust')`)
  and pass `-I dir -A dir`. Otherwise web and plugin can differ.
- Generated classes need `dsp`, `UI`, `Meta` base classes. Without an
  architecture file, provide a small glue header (see `FaustGlue.h`) with a
  `UI` that records label -> zone pointer; set controls through the pointers.
- Generated code has unused parameters and float compares: wrap its includes
  in `#pragma` warning push/pop rather than editing it.
- `de.fdelay` clamps the delay to its maximum; it does not wrap.

### 5.2 JUCE 8
- `MidiMessageCollector` lives in `juce_audio_devices` (pulls in ALSA on
  Linux). For panel notes use a `MidiBuffer` behind a `SpinLock`, with a
  try-lock on the audio thread.
- The VST3 wrapper adds about 2,080 hidden "MIDI CC" parameters (128 controllers plus aftertouch and pitch bend, per MIDI channel) (that is how VST3
  delivers pitch bend), plus "Bypass" and, with programs, "Program". Filter
  them out in tests, and never copy "Program" when cloning parameter values,
  or it loads a preset over them.
- `JUCE_DISPLAY_SPLASH_SCREEN` is ignored in JUCE 8 (warning only); drop it.
- Web browser on Windows: `NEEDS_WEBVIEW2 TRUE`,
  `JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1`, the WebView2 NuGet package
  unpacked and `-DJUCE_WEBVIEW2_PACKAGE_LOCATION=...`. On Linux:
  `NEEDS_WEB_BROWSER TRUE` and webkit2gtk-4.1 / gtk3 dev packages.
- Console test apps: set `NEEDS_WEB_BROWSER` in `juce_add_console_app(...)`
  itself (setting the property later is too late), and define
  `JUCE_MODAL_LOOPS_PERMITTED=1` to use `runDispatchLoopUntil`.
- The plugin's shared-code target does not export module include paths;
  compile the plugin's own sources into a test app instead of linking it.
- Arrays of structs in generated data need double braces for `std::array`.

### 5.3 JUCE 8.0.9 on Linux (WebKitGTK) - test platform only
- Messages between the plugin and its web-view process larger than a pipe
  buffer are dropped (non-blocking read gives up mid-message). Panel files and
  fonts are larger. Fixed in JUCE 9. For local tests we built against a
  patched JUCE copy (`-DHALDEN6_JUCE_DIR`), never committed.
- Message length is counted in characters, not bytes: a JavaScript result
  containing non-ASCII text corrupts the channel. In tests, return numbers
  (`charCodeAt`) instead of non-ASCII strings.
- The response content type does not reach WebKit; pages decode as
  windows-1252. Fix: UTF-8 BOM (section 3).
- Headless runs work under Xvfb with `WEBKIT_DISABLE_COMPOSITING_MODE=1`.

### 5.4 Windows, PowerShell 5.1, installer
- Users double-click a `.cmd` that runs `powershell -ExecutionPolicy Bypass
  -File install.ps1`; keep `.ps1` ASCII and CRLF (`.gitattributes`).
- With `$ErrorActionPreference='Stop'`, redirecting a native command's stderr
  (`git ... 2>$null`) throws in 5.1. Wrap such calls and set `Continue` inside.
- GUI programs (pluginval) return immediately: use
  `Start-Process -Wait -PassThru -NoNewWindow` and read `.ExitCode`.
- `$args` is a reserved automatic variable; never assign to it.
- `Expand-Archive` wants a `.zip` extension (name the `.nupkg` download `.zip`).
- Ask for admin only for the final copy into `C:\Program Files\Common Files\VST3`
  (one UAC prompt via `Start-Process -Verb RunAs` with an encoded command).
- Build other versions in a `git worktree`, never by checking out over the
  user's working copy.
- Check that the DAW is closed before replacing the `.vst3`; it locks files.
- Offer `winget` for missing tools (Git, CMake, VS 2022 Build Tools with the
  VCTools workload, WebView2 Runtime), then ask the user to open a new window
  if PATH changes are not visible.

### 5.5 GitHub Actions
- Pin the runner (`windows-2022`) when the installer expects a specific Visual
  Studio; `windows-latest` moves.
- Run the *user's* installer in CI (`-BuildOnly`), so the install path is
  tested on every push.
- Make the installer log facts you cannot otherwise see (e.g. "Added the
  WebView2 SDK licence"), because artifacts may not be downloadable from the
  agent's environment while logs are.
- Release on tags: check that the tag matches the version in CMake, then
  `gh release create` with `contents: write` only on that job.

### 5.6 Agent environment (sandboxed cloud session)
- Running downloaded binaries may be blocked; building from source with the
  user's permission works. Ask once, clearly, what you need and why.
- Some hosts are blocked (CDNs, vendor sites). npm usually works; use it to
  fetch JS libraries (e.g. Mermaid to validate a diagram).
- Never use `sleep` to wait for CI; schedule a check-in and read the job logs.

## 6. Tests that paid for themselves

| Test | What it caught or proves |
|---|---|
| Offline render of the web engine through the real browser output chain | The crackle: peaks over 0 dBFS |
| `generate.mjs --check` | Generated C++ out of date with panel, presets, patterns |
| Mapping check: JS vs C++ on 500 random panels | Any drift between `mapping.js` and `Mappings.h` |
| Sound check: plugin engine vs faustwasm, 5 patches, SNR > 60 dB | Engine port errors (we got 70-108 dB) |
| Arp rule script (CLI) with exact sample times | Orders, swing, gate, ties, latch, grid, loops, tempo, stop |
| Same script at block sizes 17, 128, 4096 | Block-size dependence in the arp |
| VST3 host test via `VST3PluginFormat` | Loads as instrument, MIDI, peaks, silence after release, automation, pitch bend, state round trip, 44.1-96 kHz, odd block sizes, re-insert |
| Same audio at 64 and 512 frames through the VST3 | The voice-freeing bug (4.4) and the jitter (4.5) |
| First arp note vs a note played directly on the beat | Grid alignment, including latency |
| Panel test: real editor, `evaluateJavascript`, fake audio thread | Two-way sync, gestures, presets, keys, scope, resize, arp editor, recording |
| AddressSanitizer + UBSan on the engine CLI | Memory errors in the port |
| pluginval strictness 5 in CI | Host-compatibility basics |

Test the tests: our first render comparison failed because the CLI's input
format silently stopped at a malformed line; a host test crashed because it
passed a block larger than the prepared size. When a check fails, first prove
the check is right. And compare "silence" with a threshold (1e-5), not with
exactly zero: filter tails decay to ~1e-34.

## 7. Licensing and naming checklist

- JUCE 8's free licence is AGPLv3, so the plugin (and simplest: the whole repo)
  is AGPL-3.0. Add `LICENSE` and a `THIRD-PARTY.md` with every component, its
  licence and where it is.
- The release zip must carry `LICENSE`, `THIRD-PARTY.md`, a README with the
  install steps and a link to the exact source commit, and notices that
  bundled binaries require (WebView2 SDK: copy its licence into the bundle).
- Keep other companies' trademarks out of the plugin name, vendor and IDs;
  read Steinberg's "VST" usage guidelines before a public release.
- Plugin ID = manufacturer code + plugin code: never change them. Offer a
  separate "Dev" channel with its own code so test builds sit next to stable.

## 8. Order of work that worked

1. Fix and measure the web version first; the plugin inherits its sound.
2. Licence groundwork.
3. Engine in plain C++ + CLI + comparison against the web engine.
4. JUCE wrapper, parameters from the panel definition, state, generic editor.
5. Host test; installer; Windows CI.
6. Web panel in the plugin (bridge, gestures, resizing) + panel test.
7. Presets in the host menu.
8. Sample-accurate clocked features (arp) with rule tests and block-size tests.
9. pluginval, release workflow, install docs, then the user's DAW test.
