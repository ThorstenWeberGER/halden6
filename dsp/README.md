# Halden 6 sound engine (Faust)

`halden6.dsp` is the synth voice (oscillators, PWM, sub, noise, Moog ladder filter,
envelope, LFO) plus the effect after the voices: HPF and the Juno-60 chorus. It is written in [Faust](https://faust.grame.fr) and uses only
blocks from the Faust standard libraries, so there is no hand-written DSP.

| File | What it is |
|---|---|
| `halden6.dsp` | The voice. Edit this to change the sound. |
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
- Juno-60 chorus: ported from [junologue-chorus](https://github.com/peterall/junologue-chorus) by Peter Allwin, MIT, see `../vendor/junologue-chorus-LICENSE.txt`.
- faustwasm runtime (`../vendor/faustwasm.js`): LGPL-2.1, see `../vendor/faustwasm-COPYING.txt`.
