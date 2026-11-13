# Halden 6 sound engine (Faust)

`halden6.dsp` is the synth voice (oscillators, PWM, sub, noise, a Juno-60 style
4-pole filter, envelope, LFO) plus the effect after the voices: HPF, the Juno-60
chorus, output gain and a peak limiter. It is written in [Faust](https://faust.grame.fr)
and built from blocks of the Faust standard libraries. The filter and the envelope
are written out in the file. Levels, curves and resonance are fitted to recordings
of a real Juno-60 from [Andy Harman's Juno60 analysis](https://github.com/pendragon-andyh/Juno60).
The filter's input share in the resonance path and the chorus filters come
from the Juno-60 circuit; the sources are listed in `../THIRD-PARTY.md`.

| File | What it is |
|---|---|
| `halden6.dsp` | The voice, plus the effect after the voices: HPF, chorus, output gain and limiter. Edit this to change the sound. |
| `halden6-dsp.js` | Generated: the compiled WebAssembly, embedded so `index.html` works from disk. |
| `build.mjs` | Compiles `halden6.dsp` and refreshes `halden6-dsp.js` and `../vendor/faustwasm.js`. |

## Rebuild after editing `halden6.dsp`

```
cd Halden6/dsp
npm install      # once; installs @grame/faustwasm (pinned)
npm run build
```

## Later: VST3 plugin

The same `halden6.dsp` compiles to C++ with the Faust compiler (`faust -lang cpp`).
The plan is to use that inside a JUCE VST3 plugin for Ableton Live, while the web
version keeps using the WebAssembly build. Both builds share this one file.
See [../docs/plugin-plan.md](../docs/plugin-plan.md).

## Licences

- Faust libraries used here: STK-4.3 (MIT-style) and MIT.
- Juno-60 measurements: Andy Harman's Juno60 analysis, MIT, see `../vendor/juno60-analysis-LICENSE.txt`.
- Juno-60 chorus: ported from [junologue-chorus](https://github.com/peterall/junologue-chorus) by Peter Allwin, MIT, see `../vendor/junologue-chorus-LICENSE.txt`.
- faustwasm runtime (`../vendor/faustwasm.js`): LGPL-2.1, see `../vendor/faustwasm-COPYING.txt`.
