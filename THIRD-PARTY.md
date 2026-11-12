# Third-party code and assets

Halden 6 itself is licensed under the GNU Affero General Public License v3.0
(see `LICENSE`). It includes or builds on the following work, each under its
own licence.

## In this repository today (web version)

| Component | Where | Licence | Licence text |
|---|---|---|---|
| Faust standard libraries (oscillators, Moog ladder filter, envelopes, filters, delays) | Compiled into `dsp/halden6-dsp.js` from `dsp/halden6.dsp` | MIT and STK-4.3 (MIT-style), per library function | Faust libraries repository |
| JPverb reverb (`re.jpverb`, Julian Parker, Till Bovermann) | Faust reverbs library, compiled into the sound engine | MIT | Faust libraries repository |
| junologue-chorus by Peter Allwin (Juno-60 chorus, ported to Faust) | `dsp/halden6.dsp` | MIT | `vendor/junologue-chorus-LICENSE.txt` |
| faustwasm runtime (@grame/faustwasm) | `vendor/faustwasm.js` | LGPL-2.1 | `vendor/faustwasm-COPYING.txt` |
| Barlow Condensed font | `fonts/` | SIL Open Font License 1.1 | `fonts/OFL-BarlowCondensed.txt` |
| Inter font | `fonts/` | SIL Open Font License 1.1 | `fonts/OFL-Inter.txt` |
| JetBrains Mono font | `fonts/` | SIL Open Font License 1.1 | `fonts/OFL-JetBrainsMono.txt` |

The peak limiter in `dsp/halden6.dsp` is written out in this repository. It
follows the same idea as Faust's `co.limiter_lad_N`, but does not use that
function, which is GPL-3.0-only.

## Plugin

| Component | Where | Licence | Note |
|---|---|---|---|
| JUCE 8.0.9 | `plugin/JUCE` (git submodule) | AGPLv3 (or commercial) | The reason the whole repository is AGPL-3.0. |
| VST 3 SDK | Inside JUCE | MIT since version 3.8 | |
| Faust standard libraries | Compiled into `plugin/Source/generated/` | MIT and STK-4.3 | Same libraries as the web version. |
| Microsoft WebView2 SDK 1.0.4314.35 | Loader linked statically into the Windows plugin; downloaded by `install.ps1` | BSD-style (3-clause text on nuget.org) | Its notice must travel with binaries: `install.ps1` copies the package's licence file into the plugin bundle. |

faustwasm is used by the web version only. The plugin compiles the same Faust
source to C++ instead.

## Trademarks

Halden 6 is an independent project and not affiliated with Roland. Juno and
Juno-60 are trademarks of Roland Corporation. VST is a trademark of Steinberg
Media Technologies GmbH.
