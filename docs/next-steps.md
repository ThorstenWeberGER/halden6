# Next steps for Thorsten

Status 2026-11-11: the plugin is built (phases 0 to 6). It builds and passes
its automated checks on Linux and on a Windows build server. Nobody has played
it in Ableton Live yet. Work through this list top to bottom; tick a box when
it is done.

## 1. Get the work into `main`

- [ ] Merge the branch `claude/vibrant-ramanujan-kdhn8i` into `main` (or ask
      Claude to open a pull request for it). Releases and the README links
      assume the work is on `main`.

## 1b. Put the web version online (for your phone)

- [ ] Repository Settings > Pages > Build and deployment > Source:
      **GitHub Actions** (one-time).
- [ ] After the merge into `main`, the "Web version on GitHub Pages" workflow
      publishes it (or run it by hand under Actions). Open
      https://thorstenweberger.github.io/halden6/ on your phone and tap once
      to start audio.

## 2. Install the plugin on your Windows machine

- [ ] Easiest: open the latest green run under the repository's
      **Actions > Plugin**, download `Halden6-vst3-windows`, close Live, and copy
      the `Halden 6.vst3` folder into `C:\Program Files\Common Files\VST3`.
- [ ] Or from a clone: double-click `install.cmd` and take the defaults.
- [ ] In Live: Settings > Plug-Ins, turn on "Use VST3 Plug-In System Folders",
      Rescan. Halden 6 shows under Plug-Ins > Halden.

## 3. First play (10 minutes)

- [ ] Drop Halden 6 on a MIDI track; the panel appears and you hear notes.
- [ ] Drag the window corner: the panel reflows at every size.
- [ ] Pick presets from Live's preset menu and from the panel's library; both
      show the same name.
- [ ] Arpeggiator: switch ARP on, hold a chord, press Play in Live. Notes sit
      on the beat; stop Live and the arp keeps going at Live's tempo.
- [ ] Pitch bend: move your MIDI keyboard's pitch wheel; the pitch follows
      (the panel's wheel does not move with it).
- [ ] MIDI mapping: in Live's MIDI Map mode, map a hardware knob to a Halden 6
      parameter (for plugins, Live may need the parameter added with the
      device's "Configure" button first).
- [ ] Volume: a single note at default volume is clearly audible in your
      headphones; big chords do not crackle.

## 4. The Live checklist from the plan

Note what happens for each; a short line per item is enough.

- [ ] Insert, remove the last copy, insert again (no crash).
- [ ] 8 copies in one Live set (watch memory and CPU).
- [ ] Windows display scaling at 100 %, 150 % and 200 %, with Live's
      "Auto-Scale Plug-In Window" on and off (sharp, right size, mouse hits
      the right control).
- [ ] Record automation by moving a fader in the panel, then undo (one undo
      step per drag).
- [ ] Save the set, close Live, reopen: sound, preset name, arp pattern, slots
      and window size come back.
- [ ] Export and freeze a track with the arp running: the result sounds
      exactly like playback.
- [ ] Loop a 1-bar region and change the tempo while playing: the arp stays
      on the grid.
- [ ] 44.1, 48 and 96 kHz; buffer sizes from 64 to 2048: same sound and timing.
- [ ] Close the plugin window while playing: sound and arp keep running.

## 5. Report back

- [ ] Tell Claude what failed or felt wrong (Live version 11 or 12, Windows
      version, display scaling). Screenshots help for window problems.

## 6. Before the first public release

- [ ] Read Steinberg's usage guidelines for the word "VST" and the logo (VST 3
      developer portal, "VST 3 Licensing"). Claude could not reach that page.
      Today the README and the zip say "VST3" in plain text and add "VST is a
      trademark of Steinberg Media Technologies GmbH", without the logo.
- [ ] Decide whether to stay on JUCE 8 or move to JUCE 9 (fixes a Linux-only
      web view bug; check its licence terms first). Staying on JUCE 8 is fine.
- [ ] Set the version in `plugin/CMakeLists.txt` (now 0.1.0), then tag and
      push: `git tag v0.1.0 && git push origin v0.1.0`. GitHub builds, runs
      pluginval and publishes the release zip.
- [ ] Check the release page: the zip is there, and its `README.txt` has the
      install steps and the source link.

## Later, optional

- [ ] MIDI output from the arp, so it can play other instruments in Live.
