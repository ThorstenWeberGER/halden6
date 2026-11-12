// Halden 6 voice, written in Faust. One instance per voice; faustwasm runs six.
// Every building block comes from the Faust standard libraries:
//   os.sawtooth / os.pulsetrain / os.square  band-limited oscillators (no aliasing)
//   ve.moogLadder                             4-pole ladder filter model (STK-4.3 licence)
//   en.adsr / en.asr                          envelopes
//   os.lf_sawpos_reset                        LFO phase that can restart on each note
// Controls arrive in real units (Hz, seconds, cents) from synth.js, which owns
// the mapping from fader positions, so the UI graphs and the sound agree.
// After editing, rebuild with:  node dsp/build.mjs   (see dsp/README.md)

declare name "halden6";
import("stdfaust.lib");

// set by the polyphony layer for each note
freq = hslider("freq", 440, 20, 10000, 0.01);
gain = hslider("gain", 0.8, 0, 1, 0.01);
gate = button("gate");

sm = si.smoo; // removes zipper noise when a control moves

// DCO
pitchCents = hslider("pitchCents", 0, -2400, 2400, 0.1) : sm;
glide      = hslider("glide", 0, 0, 1, 0.001);
sawOn      = hslider("sawOn", 1, 0, 1, 1) : sm;
pulseOn    = hslider("pulseOn", 0, 0, 1, 1) : sm;
subOn      = hslider("subOn", 0, 0, 1, 1) : sm;
subLevel   = hslider("subLevel", 0.6, 0, 1, 0.001) : sm;
noiseLevel = hslider("noiseLevel", 0, 0, 1, 0.001) : sm;
pwmAmt     = hslider("pwmAmt", 0.135, 0, 0.45, 0.001) : sm;
pwmMode    = hslider("pwmMode", 1, 0, 2, 1);        // 0 fixed width, 1 LFO, 2 envelope
fmAmt      = hslider("fm", 0, 0, 1, 0.001) : sm;    // 2-operator FM layer, 0 = off

// LFO
lfoRate    = hslider("lfoRate", 1, 0.05, 30, 0.001) : sm;
lfoWave    = hslider("lfoWave", 0, 0, 3, 1);         // sin, tri, saw, square
lfoDelay   = hslider("lfoDelay", 0, 0, 3, 0.001);
lfoRetrig  = hslider("lfoRetrig", 0, 0, 1, 1);       // 1 = restart with each note
lfoPitch   = hslider("lfoPitch", 0, 0, 600, 0.1) : sm;  // cents

// VCF
cutoff     = hslider("cutoff", 2000, 20, 20000, 0.1) : sm;
res        = hslider("res", 0.15, 0, 1, 0.001) : sm;
envAmt     = hslider("envAmt", 2520, -7200, 7200, 1) : sm;  // cents
lfoFilt    = hslider("lfoFilt", 0, 0, 4800, 1) : sm;        // cents
kybd       = hslider("kybd", 0.5, 0, 1, 0.001) : sm;
bendVcf    = hslider("bendVcf", 0, -4800, 4800, 1) : sm;    // cents

// ENV / VCA
att     = hslider("attack", 0.01, 0.001, 10, 0.001);
dec     = hslider("decay", 0.2, 0.001, 10, 0.001);
sus     = hslider("sustain", 0.6, 0, 1, 0.001);
rel     = hslider("release", 0.2, 0.001, 10, 0.001);
vcaGate = hslider("vcaGate", 0, 0, 1, 1);
velEnv  = hslider("velEnv", 0, 0, 1, 0.001);

vel = 1 - velEnv * (1 - gain);
env = en.adsr(att, dec, sus, rel, gate);

// LFO with delayed fade-in
phase  = os.lf_sawpos_reset(lfoRate, (gate > gate') * lfoRetrig);
lfoRaw = ba.selectn(4, lfoWave,
           sin(2 * ma.PI * phase),
           1 - 4 * abs(phase - 0.5),
           1 - 2 * phase,
           select2(phase < 0.5, -1, 1));
lfo    = lfoRaw * en.asr(max(0.001, lfoDelay), 1, 0.05, gate);

// Oscillators
f     = freq : si.smooth(ba.tau2pole(glide / 3));
fm    = f * pow(2, (pitchCents + lfo * lfoPitch) / 1200);
duty  = ba.selectn(3, pwmMode, 0.5 - pwmAmt, 0.5 + pwmAmt * lfo, 0.5 - pwmAmt * env);
// FM: a classic 2-operator pair, a sine one octave up phase-modulating a sine
// at the note's pitch. The knob raises both the modulation (bell-like,
// metallic overtones) and the level of this layer, so 0 is the plain DCO.
fmOp  = sin(2 * ma.PI * os.lf_sawpos(fm) + fmAmt * 4 * sin(2 * ma.PI * os.lf_sawpos(fm * 2)));
osc   = os.sawtooth(fm) * sawOn * 0.35
      + os.pulsetrain(fm, duty) * pulseOn * 0.35
      + os.square(fm * 0.5) * subOn * subLevel * 0.4
      + no.noise * noiseLevel * 0.3
      + fmOp * fmAmt * 0.4;

// Filter: cutoff moved by envelope, LFO, keyboard tracking and pitch wheel
note   = ba.hz2midikey(freq);
fc     = cutoff * pow(2, (envAmt * env * vel + lfoFilt * lfo + kybd * (note - 60) * 100 + bendVcf) / 1200)
       : max(20) : min(18000);
filt   = osc : ve.moogLadder(log10(fc / 20) / 3, 0.707 + res * res * 22);

// VCA: envelope, or a plain on/off gate
amp = select2(vcaGate, env, en.asr(0.003, 1, 0.01, gate));

process = filt * amp * vel * 0.6;

//---------------------------------------------------------------------------
// Effect after all voices are mixed: HPF, then the Juno-60 chorus.
//
// The chorus is a Faust port of "Junologue Chorus" by Peter Allwin
// (https://github.com/peterall/junologue-chorus, MIT licence, see
// ../vendor/junologue-chorus-LICENSE.txt). Delay times, LFO rates, filter
// cutoffs, the soft limiter and the mode gains are taken from that code,
// which builds on Juno-60 research by Andy Harman and JP Cimalando.
// As in the original, I+II runs both choruses in parallel (like TAL U-NO-LX),
// not the Juno-60's mono vibrato.
//---------------------------------------------------------------------------
hpfFreq    = hslider("hpf", 10, 10, 2000, 0.1) : sm;
chorusMode = hslider("chorusMode", 1, 0, 3, 1);    // 0 off, 1 I, 2 II, 3 I+II

softLimit(x) = x * (27 + x * x) / (27 + 9 * x * x);
tri(f)       = (os.lf_triangle(f) + 1) / 2;         // unipolar triangle, like SimpleLFO::triangle_uni
p1 = tri(0.513);                                    // chorus I rate
p2 = tri(0.863);                                    // chorus II rate
maxDelay = 1024;                                    // samples: the longest tap is 5.4 ms, 519 samples at 96 kHz
tL(p) = (0.00154 + (0.00515 - 0.00154) * p) * ma.SR;
tR(p) = (0.00151 + (0.00540 - 0.00151) * p) * ma.SR;
gA  = ba.selectn(4, chorusMode, 0, 1, 0, 0.7071);   // chorus I share
gB  = ba.selectn(4, chorusMode, 0, 0, 1, 0.7071);   // chorus II share
on  = chorusMode > 0;
dry = select2(on, 1, 0.7071);                       // depth at "12 o'clock" in the original
wet = select2(on, 0, 0.7071);

// Each chorus has a left tap swept by p and a right tap swept by 1-p
chorus(x) = outL, outR
with {
  pre  = x : softLimit : fi.lowpass(1, 7375);       // pre-filter before the BBD
  a1L  = de.fdelay(maxDelay, tL(p1), pre);
  a1R  = de.fdelay(maxDelay, tR(1 - p1), pre);
  a2L  = de.fdelay(maxDelay, tL(p2), pre);
  a2R  = de.fdelay(maxDelay, tR(1 - p2), pre);
  wL   = (a1L * gA + a2L * gB) : fi.lowpass(1, 10375);  // post-filter
  wR   = (a1R * gA + a2R * gB) : fi.lowpass(1, 10375);
  outL = x * dry + wL * wet;
  outR = x * dry + wR * wet;
};

//---------------------------------------------------------------------------
// Output stage: gain, then a peak limiter.
//
// outGain is +12 dB makeup times the VCA level times the master volume (set by
// synth.js). Big chords then go far over full scale, so the limiter must
// catch every peak: anything over 1.0 clips in the sound card and crackles.
// It looks ahead: the audio is delayed by 5 ms while the gain already falls,
// so the gain is down before the peak arrives. Hold keeps it down for at
// least that long; release lets it back up over about 200 ms.
// Same idea as co.limiter_lad_N (Zoelzer / Zmoelnig), written out here to keep
// this file on MIT / STK-4.3 library code.
//---------------------------------------------------------------------------
outGain  = hslider("outGain", 1, 0, 8, 0.001) : sm;
ceiling  = 0.89;                                    // -1 dBFS
LA       = 0.005;                                   // lookahead, seconds

limiter(l, r) = dl * g, dr * g : clip, clip
with {
  n     = int(LA * ma.SR);
  dl    = l @ n;
  dr    = r @ n;
  peak  = max(abs(l), abs(r)) : ba.peakholder(n + 1)
        : si.smooth(ba.tau2pole(LA / 5))            // reaches 99 % within the lookahead
        : release;
  release(x) = x : (max ~ *(ba.tau2pole(0.2)));      // falls back with a 200 ms time constant
  g     = ceiling / max(peak, ceiling);              // 1 below the ceiling
  clip  = max(-1) : min(1);                          // last safety net, normally idle
};

//---------------------------------------------------------------------------
// Texture: drive from warm to gritty. A tanh saturation with a little
// asymmetry (even harmonics, "roughness"); 0 is the untouched signal. The
// level is roughly kept as the drive rises; the limiter catches the rest.
//---------------------------------------------------------------------------
texture = hslider("texture", 0, 0, 1, 0.001) : sm;
drive(x) = x * (1 - w) + shaped * w
with {
  d      = 1 + 24 * texture;
  bias   = 0.25 * texture;
  w      = min(1, texture * 3);
  shaped = (ma.tanh(x * d + bias) - ma.tanh(bias)) / sqrt(d) : fi.dcblocker;
};

//---------------------------------------------------------------------------
// Reverb: re.jpverb (Julian Parker, MIT), a lush algorithmic reverb made for
// synthesizers. Amount adds the reverb to the dry sound; Length is its decay
// time in seconds. Its delay lines follow the sample rate.
//---------------------------------------------------------------------------
revMix  = hslider("revMix", 0, 0, 1, 0.001) : sm;
revTime = hslider("revTime", 1.7, 0.3, 12, 0.01) : sm;
// jpverb comes out hot: 0.3 puts Amount 100 % at about the dry level
reverb  = _,_ <: _,_, (re.jpverb(revTime, 0.35, 1.2, 0.707, 0.15, 0.5, 1, 1, 0.8, 500, 3500) : *(revMix * 0.3), *(revMix * 0.3)) :> _,_;

effect = fi.highpass(2, hpfFreq) : drive : chorus : reverb : *(outGain), *(outGain) : limiter;
