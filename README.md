![Halden 6: a modern Juno-style poly synth in the browser. Six voices, the Juno-60 chorus, 100 presets, a 16-step arpeggiator and three skins, on a panel that scales to any screen](docs/hero-banner.png)

# Halden 6: a modern Juno-style poly synth for the browser

## Why I built this

I love synths. What I missed was a modern Juno experience: the simple, warm
voice and that chorus, on a panel that scales from a laptop to a studio
monitor, with an arpeggiator built right in. I couldn't find one, so I built it.

Halden 6 is one HTML page with a real sound engine behind it: six voices, a
Moog-style ladder filter and the Juno-60 chorus, written in Faust and compiled
to WebAssembly. No install, no server, no account.

![The full Halden 6 panel in the Studio skin with the preset "PWM String Pad" loaded: Control, Chorus, LFO and DCO on the top row; Performance, HPF, VCF, VCA and ENV on the second row; the folded Arpeggiator bar and the keyboard below](docs/images/panel.png)

## Run it

Open `index.html` in Chrome or Edge (double-click works, no server or install).
Click once anywhere to start audio, then play with the mouse or the keyboard.

For the lowest latency, serve the folder instead (the sound engine then runs on
its own audio thread):

```
cd Halden6 && python3 -m http.server 8000     # then open http://localhost:8000
```

| Input | Action |
|---|---|
| `A W S E D F T G Y H U J K O L P ;` | Play notes (C4 upwards) |
| `Z` / `X` | Octave down / up |
| Drag, mouse wheel, arrow keys | Move a fader or knob (Shift = fine) |
| Double-click | Reset a fader or knob |
| Click lower on a piano key | Louder note (used by Velocity Env) |

Works fully offline: fonts are bundled in `fonts/` (SIL Open Font License).

## One panel for every screen

The panel is laid out like hardware: one faceplate, sections split by hairlines.
Sizes grow with the window, so faders and labels stay readable on a 27-inch
monitor and still fit a laptop. On narrow screens the sections wrap into more
rows instead of shrinking to nothing.

![The same panel at three window sizes: 2560 × 1440 on a studio monitor, 1440 × 900 on a laptop, and 820 × 1180 on a tablet, where the sections wrap into more rows](docs/images/scaling.png)

## See what every control does

DCO, LFO, VCF and ENV each show a small live graph of what their controls do:
the oscillator mix, two seconds of LFO (with the delay fade-in), the real
filter curve (lowpass, resonance and HPF together) and the envelope shape.
The Arpeggiator bar shows the live output wave. Trace colour follows the
section colour: red in Studio, orange in Neon, green in Daylight.

![Close-ups of the DCO, ENV, LFO and VCF sections with the preset "Synthwave Lead": saw plus pulse waveform, an envelope with 20 ms attack, a 4 Hz sine LFO with a 600 ms delay fade-in, and a 2.2 kHz filter curve with a resonance peak](docs/images/graphs.png)

## Arpeggiator

Click the **Arpeggiator** bar between the panel and the keys to fold it open.
Switch **On**, then choose a mode:

- **Arp** plays the keys you hold: order (up, down, up-down, random, as played),
  1 to 4 octaves, gate length.
- **Pattern** plays a 16-step pattern. Hold C4 to hear it as written; any other
  key transposes it. Edit each step: click the number for note or rest, drag the
  note up or down, drag the velocity and gate bars, set Tie to hold into the next step.
- **Record**: press **Rec**, then play one key per step (**Rest** adds a pause).
  Press **Rec** again to finish; the pattern length becomes the number of steps recorded.
- **Latch** keeps it playing after you let go. **BPM** (drag, scroll or **Tap**)
  also drives LFO tempo sync. **Swing** delays every second step.
- **80s presets**: 7 factory patterns in typical 80s styles (Italo octave bass,
  Hi-NRG gallop, synthpop arp, electro funk, new wave drive, soundtrack sequence,
  minimal wave). They are original patterns, not transcriptions of songs.
  Loading one sets its BPM, rate and swing and switches to Pattern mode.
- **Slots**: pick one of 8 slots, type a name, **Save**. **Load** brings back the
  pattern with its BPM and rate. Slots and the current pattern survive a reload.

![The open arpeggiator in Pattern mode with the factory pattern "Italo Octaves" at 118 BPM: Arp, Clock and Arp Mode sections on top, and the 16-step editor with note, velocity, gate and tie per step](docs/images/arpeggiator.png)

## Presets

100 factory sounds in 10 categories (Bass, Lead, Pad, Keys, Brass, Strings,
Pluck, Bell, Arp, FX) across about 50 styles, from Synthpop, Italo and Acid to
Synthwave, Lo-fi, Trap, Future Bass and Cinematic. Use the arrows next to the
preset name in the top bar, or click the name to search and filter the library.
A `*` after the name means you changed the sound since loading it. Presets
change the sound only; arpeggiator, tempo and volume stay. All presets live
in `presets.js` in real units (Hz, seconds), so they are easy to edit.

![The preset library open on the left with search, category filters and the list of presets; "092 Berlin Sequence" is loaded and shown in the top bar](docs/images/presets.png)

## Skins

Switch with **Studio / Neon / Daylight** in the top bar; the choice is remembered.
A skin is a block of colour tokens in `styles.css` under `[data-skin="..."]`.
To add one, copy the Neon block, change the values, and add a button in `index.html`.

![The panel in the three skins side by side: Studio with a dark faceplate and red sections, Neon in violet and orange, Daylight as a light panel with green traces](docs/images/skins.png)

Behind the main panel sits a faint octagon tile grid under soft club
lighting, with a few tiles glowing slowly in the skin's colours. It is drawn
in `backdrop.js`; each skin sets its colours and strength with the `--bd-*`
tokens in `styles.css`. Tiles stop pulsing when the system asks for reduced
motion.

## Discuss changes with Claude

1. Click **Comment mode**, then click any control or section header and type a note.
2. Click **Notes**, then **Save notes file**, and save as `Halden6/notes/halden6-notes.md`.
3. Tell Claude to read the notes. The file lists each note, the control's value
   at the time, and the full patch.

Notes also stay in the browser between sessions. **Copy as Markdown** puts
them on the clipboard to paste straight into the chat.

## Files

| File | What it holds |
|---|---|
| `panel.js` | Every section and control. Add or move a control here. |
| `synth.js` | Connects the UI to the sound engine and maps fader positions to real units. |
| `presets.js` | The 100 factory presets. |
| `dsp/` | The synth voice, HPF and Juno-60 chorus in Faust, compiled to WebAssembly. See `dsp/README.md`. |
| `vendor/` | faustwasm browser runtime (LGPL-2.1) and the junologue-chorus licence (MIT). |
| `viz.js` | Section graphs and the live output scope. |
| `backdrop.js` | Octagon backdrop behind the main panel, coloured per skin. |
| `arp.js` | Arpeggiator: clock, modes, recording, pattern editor, slots. |
| `ui.js` | Rendering, input, keyboard, comment mode. |
| `styles.css` | Look, layout and skins. |
| `fonts/` | Bundled font files and their licences. |
| `docs/` | README images, the script that renders them, and the plugin plan. |

Plain HTML, CSS and JavaScript with no build step.

## Next: a VST3 plugin for Ableton Live

The plan is to ship Halden 6 as an open-source VST3 instrument for Ableton Live
on Windows, built with JUCE. It will reuse this panel and the same Faust sound
engine, and the web version stays. See [docs/plugin-plan.md](docs/plugin-plan.md).

### Refresh the README images

Every picture above is a screenshot of the real `index.html`, taken by
Playwright. After a UI change, run:

```
pip install playwright && playwright install chromium   # once
python docs/render_images.py
```

It writes `docs/images/*.png` and `docs/hero-banner.png` (the banner layout is
`docs/hero-banner.html`).

## Interpretations to confirm

These are not clear from the reference image and are open for discussion:

- **DCO switches**: first = PWM source (LFO or ENV), second = PWM modulation on/off.
  Off makes the PWM fader a fixed pulse width.
- **ML / G-ML**: one note at a time; G-ML adds an 80 ms glide. Each new note restarts the envelope (no true legato yet).
- **Pitch wheel section** is labelled "Performance"; the bend faders are
  "Bend DCO" (up to 12 semitones) and "Bend VCF".

---

Halden 6 is an independent project and not affiliated with Roland. Juno and
Juno-60 are trademarks of Roland Corporation.
