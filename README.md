# Juno: analog poly synth mock UI

A browser mock of the panel in `reference/original-panel.png`, with a working
sound engine and a comment mode for discussing changes with Claude.

## Run it

Open `index.html` in Chrome or Edge (double-click works, no server or install).
Click once anywhere to start audio, then play with the mouse or the keyboard.

| Input | Action |
|---|---|
| `A W S E D F T G Y H U J K O L P ;` | Play notes (C4 upwards) |
| `Z` / `X` | Octave down / up |
| Drag, mouse wheel, arrow keys | Move a fader or knob (Shift = fine) |
| Double-click | Reset a fader or knob |
| Click lower on a piano key | Louder note (used by Velocity Env) |

Works fully offline: fonts are bundled in `fonts/` (SIL Open Font License).

## Skins

Switch with **Studio / Neon / Daylight** in the top bar; the choice is remembered.
A skin is a block of colour tokens in `styles.css` under `[data-skin="..."]`.
To add one, copy the Neon block, change the values, and add a button in `index.html`.

## Discuss changes with Claude

1. Click **Comment mode**, then click any control or section header and type a note.
2. Click **Notes**, then **Save notes file**, and save as `Juno/notes/juno-notes.md`.
3. Tell Claude to read the notes. The file lists each note, the control's value
   at the time, and the full patch.

Notes also stay in the browser between sessions. **Copy as Markdown** puts
them on the clipboard to paste straight into the chat.

## Files

| File | What it holds |
|---|---|
| `panel.js` | Every section and control. Add or move a control here. |
| `synth.js` | Web Audio sound engine. |
| `ui.js` | Rendering, input, keyboard, comment mode. |
| `styles.css` | Look, layout and skins. |
| `fonts/` | Bundled font files and their licences. |

Plain HTML, CSS and JavaScript with no build step, so Electron or Tauri can
wrap it as a desktop app later.

## Interpretations to confirm

These are not clear from the reference image and are open for discussion:

- **DCO switches**: first = PWM source (LFO or ENV), second = PWM modulation on/off.
  Off makes the PWM fader a fixed pulse width.
- **ML / G-ML**: mono legato, and mono legato with glide (fixed 80 ms).
- **LFO Tempo**: syncs to a fixed 120 BPM, since a browser has no host tempo.
- **Pitch wheel section** is labelled "Performance"; the bend faders are
  "Bend DCO" (up to 12 semitones) and "Bend VCF".
