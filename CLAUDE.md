# CLAUDE.md

Guidance for Claude Code in this repository.

## What this is

Halden 6: a Juno-60 style poly synth. One set of sources drives two products:

- **Web version:** `index.html` plus plain JS/CSS, no build step for the page.
  Live at https://thorstenweberger.github.io/halden6/ (deployed from `main` by
  `.github/workflows/pages.yml`).
- **VST3 plugin for Ableton Live on Windows:** JUCE, C++, in `plugin/`. It shows
  the same panel in a web view and runs the same Faust sound engine as C++.

The sound engine is `dsp/halden6.dsp` (Faust). It is the only place sound is
defined. The web version runs it as WebAssembly, the plugin as generated C++.
Both must sound the same; `plugin/tools/check.mjs` proves it.

## Key files

| File | Role |
|---|---|
| `dsp/halden6.dsp` | Voice and effect. Edit this to change the sound. |
| `dsp/halden6-dsp.js` | Generated WebAssembly, committed. |
| `panel.js` | Every control. Control ids are DAW parameter ids: never rename or remove one. |
| `mapping.js` | Fader position to Hz, seconds, cents. Mirrored in C++ in `plugin/Source/Mappings.h`. |
| `presets.js` | 100 factory presets in real units, converted by `toPanel()`. |
| `viz.js` | Panel graphs. Its filter, envelope and LFO curves must match the DSP. |
| `plugin/Source/Engine.cpp` | Plugin voice pool. Copies faustwasm's rules exactly (see below). |
| `plugin/Source/generated/` | Generated, committed. Never edit by hand. |
| `docs/guide.md` | User and developer guide. `README.md` is the short story. |

## After changing the sound

Run these in order. CI fails if a step is skipped.

```bash
cd dsp && npm ci && npm run build && cd ..        # web engine (dsp/halden6-dsp.js)
FAUST=/path/to/faust node plugin/tools/generate.mjs --dsp   # plugin C++ (needs Faust 2.88.0)
node plugin/tools/generate.mjs --check            # generated files up to date
node plugin/tools/check.mjs                       # web vs plugin: mappings, sound, arp
```

- **Faust version:** the plugin C++ is generated with Faust **2.88.0**, using the
  libraries bundled in `@grame/faustwasm`. No Linux package has it; build it
  from source (C++ backend only, a few minutes):
  ```bash
  git clone --depth 1 --branch 2.88.0 https://github.com/grame-cncm/faust
  mkdir faust/build/fb && cd faust/build/fb
  cmake -C ../backends/light.cmake -DINCLUDE_STATIC=OFF -DINCLUDE_DYNAMIC=OFF \
        -DINCLUDE_OSC=OFF -DINCLUDE_HTTP=OFF -DCMAKE_BUILD_TYPE=Release ..
  make -j4 faust                                  # result: faust/build/bin/faust
  ```
  Check: regenerating from an unchanged `halden6.dsp` must reproduce the
  committed C++ byte for byte.
- **Mappings:** a change in `dspValues()` in `mapping.js` needs the same change in
  `plugin/Source/Mappings.h`.
- **Presets:** after a change that alters loudness or brightness, re-match presets
  to their previous loudness (RMS) and brightness (spectral centroid) by
  adjusting `cut` and `level`. Report presets that cannot be matched.

## Lessons that cost time

- **Precision across platforms:** `1 - exp(-x)` for small x loses most digits in
  32-bit floats, and WebAssembly and C++ round `exp` differently. Use the
  series form (see `co()` in `junoEnv`). Long envelopes otherwise end a sample
  apart and the web and plugin free different voices.
- **Voice freeing:** faustwasm frees a releasing voice when the RMS of a
  128-frame block is below -90 dB. The plugin copies this exactly (RMS, not
  peak, on a global 128-frame grid). Do not change one side alone.
- **Sample rates:** test 44.1, 48 and 96 kHz. Delay buffers sized "enough at 48
  kHz" have been too short at 96 kHz.

## Where the sound comes from

- **Reference:** recordings of a real Juno-60 by Andy Harman
  (github.com/pendragon-andyh/Juno60, MIT). Fit to them and measure the match;
  do not tune by ear alone.
- **Circuit facts:** component values and hardware measurements from public
  sources, listed in `THIRD-PARTY.md`. Take facts only, never code or text
  from GPL or unlicensed projects. Credit every source there.
- **Not allowed:** TAL Software's terms forbid measuring their plugins' output to
  model a sound. Never use TAL-U-NO or other TAL products as a reference.
- **Removed on purpose:** chorus hiss. The owner does not want a noise floor.

## Writing

- Docs and the README: plain English, short sentences, no em dashes. The README
  is a short article; detail belongs in `docs/guide.md`.
- No marketing words. State what was measured and how close it is.

## Releasing a new version

1. Raise the version in two places: the panel label in `index.html`
   (`poly synth · v0.2`) and the default in `plugin/CMakeLists.txt`.
2. Merge to `main`, then run Actions > Plugin > Run workflow on `main` with the
   version, e.g. `0.2.0`. It publishes the release with the zip twice:
   `Halden6-vst3-<version>.zip` and `Halden6-vst3-windows.zip` (the fixed name
   behind the download link in the README and the portfolio post).

## Git

- Work on the session branch; open a pull request into `main`.
- Merge only when CI ("Plugin" workflow) is green, or when the owner says so.
- Generated files (`dsp/halden6-dsp.js`, `plugin/Source/generated/`) are
  committed together with the source change that produced them.
