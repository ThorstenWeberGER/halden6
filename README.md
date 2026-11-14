![Halden 6: a modern Juno-style poly synth in the browser. Six voices, the Juno-60 chorus, 100 presets, a 16-step arpeggiator and three skins, on a panel that scales to any screen](docs/hero-banner.png)

# Halden 6: the warm sound of a Juno-60, in your browser

**Halden 6 is a free synthesizer that sounds like the Roland Juno-60, a
classic of the 1980s. It runs in any browser, on a phone too, and as a
plugin in Ableton Live.**

Play it now: **https://thorstenweberger.github.io/halden6/** Tap once to
start the sound, then play the keys.

Plugin for Ableton Live on Windows:
**[Download Halden6-vst3-windows.zip](https://github.com/ThorstenWeberGER/halden6/releases/latest/download/Halden6-vst3-windows.zip)**

## Why I built it

I love synthesizers. The Juno-60 is one of my favourites: a simple voice, a
warm filter and a chorus that makes every chord shimmer.

What I could not find was a modern version of that experience. I wanted a
panel that looks good on a laptop and on a large studio screen, an
arpeggiator built in, and no installation. So I built it.

Halden 6 is one web page. Behind it sits a real sound engine with six
voices. The same engine also runs as a VST3 plugin in Ableton Live on
Windows. Both versions sound the same, note for note.

## What you get

- **Six voices.** Play chords, like on the original.
- **100 sounds.** Bass, leads, pads, strings, bells and more, in about 50
  styles from Italo disco to synthwave. Search them from the top bar.
- **An arpeggiator.** It plays the keys you hold, or a 16-step pattern you
  write or record. Seven patterns in classic 80s styles are included.
- **MIDI.** Plug in a keyboard and play. Any hardware knob can take over any
  control on the panel.
- **A panel that fits every screen.** It grows on a big monitor and wraps into
  more rows on a phone.
- **Three looks.** Studio, Neon and Daylight.

![The full Halden 6 panel in the Studio skin with the preset "PWM String Pad" loaded: Control, Chorus, LFO and DCO on the top row; Performance, HPF, VCF, VCA and ENV on the second row; the folded Arpeggiator bar and the keyboard below](docs/images/panel.png)

Small screens above each section show what a control does: the waveform,
the filter curve, the envelope and the LFO. When you move a slider, you
see the change before you hear it.

![Close-ups of the DCO, ENV, LFO and VCF sections with the preset "Synthwave Lead": saw plus pulse waveform, an envelope with 20 ms attack, a 4 Hz sine LFO with a 600 ms delay fade-in, and a 2.2 kHz filter curve with a resonance peak](docs/images/graphs.png)

## How the sound was made

**The sound was not tuned by ear. It was measured.**

Andy Harman recorded a real Juno-60, one setting at a time, and published
about 80 recordings. We played the same notes through Halden 6 and
compared the two, again and again, until they matched.

- **The filter.** On a Juno-60, resonance makes a note sing. The recordings
  show how strongly: up to 18 dB at the top. Halden 6 now matches each
  step within 1 dB. At the top it starts to whistle on its own, like the
  original.
- **The envelope.** In the Juno, notes swell and fade like a charging
  capacitor, not in straight lines. Halden 6 follows the same curves.
- **The levels.** Saw, pulse, sub-oscillator and noise sit at the same
  levels as on the Juno.
- **The chorus.** This is the Juno's famous shimmer. Its two modes match the
  recordings within about 1 dB on average. Both buttons together give the Juno's own
  fast vibrato.

Where the recordings left gaps, the Juno's circuit filled them. Published
component values show two things. The filter keeps more bass at high
resonance than a plain filter would. And the chorus sits between steep
filters, which keep it dark and smooth. Halden 6 copies both.

Two choices were deliberate:

- **No hiss.** The original chorus hisses. We left that out.
- **Only public facts.** We did not copy other software. One commercial
  emulation forbids using its sound as a reference, so we did not use it.

The extras the Juno never had stay on the panel: reverb, a drive control
called Texture, and a bell-like FM layer. Set to zero, Halden 6 is a
Juno-60.

![The panel in the three skins side by side: Studio with a dark faceplate and red sections, Neon in violet and orange, Daylight as a light panel with green traces](docs/images/skins.png)

## Who may use it, and how

**Halden 6 is free software under the GNU Affero General Public License
v3.0.** In plain words:

- **Make music with it**, commercial music too. Your music is yours.
- **Change it and share it.** If you share a changed version, or run one on a
  website, publish its source code under the same licence.
- **Parts from others** are listed in [THIRD-PARTY.md](THIRD-PARTY.md).

Halden 6 is not linked to Roland. Juno and Juno-60 are trademarks of Roland
Corporation. VST is a trademark of Steinberg Media Technologies GmbH.

## The plugin for Ableton Live

The plugin runs on Windows 11 (or Windows 10 with the WebView2 Runtime).

**The quick way: download it.**

1. [Download the newest version](https://github.com/ThorstenWeberGER/halden6/releases/latest/download/Halden6-vst3-windows.zip).
   Older versions are on the [releases page](https://github.com/ThorstenWeberGER/halden6/releases).
2. Close Live. Copy the `Halden 6.vst3` folder from the zip to
   `C:\Program Files\Common Files\VST3`.

**Build it yourself.**

1. Clone this repository with its submodules:
   `git clone --recursive https://github.com/ThorstenWeberGER/halden6`
2. Double-click `install.cmd`. It installs missing build tools on request,
   builds the plugin and copies it to your VST3 folder.
   `install.ps1 -Uninstall` removes it.

**Then, in Live:** open Settings, then Plug-Ins. Turn on "Use VST3 Plug-In
System Folders" and click Rescan. Drop Halden 6, under Plug-Ins > Halden, on
a MIDI track.

**More detail:** every control, MIDI learn and the code are explained in the
[guide](docs/guide.md).
