# Juno sound engine (Faust)

`juno.dsp` is the synth voice: oscillators, PWM, sub, noise, Moog ladder filter,
envelope, LFO. It is written in [Faust](https://faust.grame.fr) and uses only
blocks from the Faust standard libraries, so there is no hand-written DSP.

| File | What it is |
|---|---|
| `juno.dsp` | The voice. Edit this to change the sound. |
| `juno-dsp.js` | Generated: the compiled WebAssembly, embedded so `index.html` works from disk. |
| `build.mjs` | Compiles `juno.dsp` and refreshes `juno-dsp.js` and `../vendor/faustwasm.js`. |

## Rebuild after editing `juno.dsp`

```
cd Juno/dsp
npm install      # once; installs @grame/faustwasm (pinned)
npm run build
```

## Later: desktop app or plugin

The same `juno.dsp` compiles to C++ with the Faust compiler, for example as a
JUCE standalone app or VST/AU plugin (`faust2juce juno.dsp`). The browser UI
can stay as it is inside a desktop shell, or the DSP can run natively.

## Licences

- Faust libraries used here: STK-4.3 (MIT-style) and MIT.
- faustwasm runtime (`../vendor/faustwasm.js`): LGPL-2.1, see `../vendor/faustwasm-COPYING.txt`.
