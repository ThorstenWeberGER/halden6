// Halden 6 voice, written in Faust. One instance per voice; faustwasm runs six.
// It follows the Roland Juno-60: oscillator levels, the 4-pole filter with its
// resonance, the envelope curves, the HPF and the chorus are fitted to
// recordings of a real Juno-60 by Andy Harman (github.com/pendragon-andyh/Juno60,
// MIT licence). Building blocks:
//   os.sawtooth / os.pulsetrain / os.square  band-limited oscillators (no aliasing)
//   junoVCF                                   4-pole filter, written out below
//   junoEnv                                   envelope with capacitor-like curves, below
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

// Envelope with the curves of the Juno-60, which charges and discharges a
// capacitor. Measured by Andy Harman:
//   attack:  level = (1 - exp(-t/A)) / 0.632, so it reaches full level at A
//   decay:   falls exponentially towards the sustain level, done after D
//   release: falls exponentially to zero, done after R
// A new note starts the attack from wherever the envelope is.
junoEnv(a, d, s, r, g) = (step ~ (_, _)) : (_, !)
with {
  // One-pole coefficient 1 - exp(-x) for time constant t, x = 1 / (t * SR).
  // For small x it is a short series: 1 - exp(-x) in 32-bit floats loses most
  // of its digits there, and the browser and the plugin would round it
  // differently, so long envelopes would end a sample apart.
  co(t) = select2(x < 0.03, 1 - exp(-x), x * (1 - x * (0.5 - x * (1 / 6 - x / 24))))
  with { x = 1 / (max(0.0005, t) * ma.SR); };
  ca = co(a); cd = co(d / 3.5); cr = co(r / 3.5);
  on = g > 0;
  rise = on * (g' <= 0);
  step(y, atk) = yn, an
  with {
    attacking = on * ((rise + atk) > 0) * (y < 1);
    yA = min(1, y + (1.582 - y) * ca);
    yD = select2(y > s, y + (s - y) * cd, max(s, y + (s - 0.031 - y) * cd));
    yR = max(0, y + (-0.031 - y) * cr);
    yn = select2(on, yR, select2(attacking, yD, yA));
    an = attacking * (yn < 1);
  };
};
env = junoEnv(att, dec, sus, rel, gate);

// LFO with a delay: it stays silent for 3/4 of the delay time, then fades in
// over the last quarter, as the Juno-60's LFO delay does.
phase  = os.lf_sawpos_reset(lfoRate, (gate > gate') * lfoRetrig);
lfoRaw = ba.selectn(4, lfoWave,
           sin(2 * ma.PI * phase),
           1 - 4 * abs(phase - 0.5),
           1 - 2 * phase,
           select2(phase < 0.5, -1, 1));
sinceOn = (+(1) : *(gate > 0)) ~ _;                  // samples since the note started
lfoFade = (sinceOn / ma.SR - 0.75 * lfoDelay) / max(0.0001, 0.25 * lfoDelay) : max(0) : min(1);
lfo     = lfoRaw * select2(lfoDelay > 0.001, 1, lfoFade) * en.asr(0.001, 1, 0.05, gate);

// Oscillators
f     = freq : si.smooth(ba.tau2pole(glide / 3));
fm    = f * pow(2, (pitchCents + lfo * lfoPitch) / 1200);
duty  = ba.selectn(3, pwmMode, 0.5 - pwmAmt, 0.5 + pwmAmt * lfo, 0.5 - pwmAmt * env);
// FM: a classic 2-operator pair, a sine one octave up phase-modulating a sine
// at the note's pitch. The knob raises both the modulation (bell-like,
// metallic overtones) and the level of this layer, so 0 is the plain DCO.
fmOp  = sin(2 * ma.PI * os.lf_sawpos(fm) + fmAmt * 4 * sin(2 * ma.PI * os.lf_sawpos(fm * 2)));
// Levels as on the Juno-60: saw, pulse and sub peak at the same level; the
// noise is low-passed at 5 kHz and sits about 3.5 dB below the saw.
osc   = os.sawtooth(fm) * sawOn * 0.35
      + os.pulsetrain(fm, duty) * pulseOn * 0.35
      + os.square(fm * 0.5) * subOn * subLevel * 0.31
      + (no.noise : fi.lowpass(1, 5000)) * noiseLevel * 0.48
      + fmOp * fmAmt * 0.4;

// Filter: cutoff moved by envelope, LFO, keyboard tracking and pitch wheel
note   = ba.hz2midikey(freq);
fc     = cutoff * pow(2, (envAmt * env * vel + lfoFilt * lfo + kybd * (note - 60) * 100 + bendVcf) / 1200)
       : max(20) : min(18000);
filt   = osc : junoVCF(fc, 4.3 * pow(sin(ma.PI / 2 * res), 2.2));

// Juno-60 style 4-pole low-pass: four identical one-pole stages (zero-delay
// "TPT" form, exact at every cutoff) with feedback k from the output. As in
// the Juno's circuit, part of the input (0.31, set there by the resistors
// around the resonance amplifier) is fed into the feedback path. That keeps
// the bass: full resonance costs about 7 dB instead of 14. The feedback runs
// through a soft saturation, so the resonance grows as on the Juno and
// self-oscillates at the top (k > 4, from about 8.5) without blowing up.
// The resonance curve k = 4.3 * sin(res * pi/2)^2.2 fits two references at
// once: Juno-60 recordings (+2.4, +9.3, +15.6, +17.6 dB at the peak for
// resonance 2.5, 5, 7.5 and 10; measured +2.3, +9.9, +16.2, +17.8) and
// hardware measurements of the feedback in the KR-106 project. The
// saturation is solved on its tangent in each sample, so the loop stays
// zero-delay and stable.
junoVCF(fc, k, x) = loop ~ si.bus(4) : (!, !, !, !, _)
with {
  drive = 3;
  c  = 0.31;                                        // input share in the feedback path
  wc = tan(ma.PI * min(fc, 0.45 * ma.SR) / ma.SR);
  g  = wc / (1 + wc);
  G  = g * g * g * g;
  loop(s1, s2, s3, s4) = l1 + v1, l2 + v2, l3 + v3, l4 + v4, l4
  with {
    S     = g * g * g * (1 - g) * s1 + g * g * (1 - g) * s2 + g * (1 - g) * s3 + (1 - g) * s4;
    e     = (G * x + S - c * x) / (1 + k * G);         // feedback signal y - c x, linear estimate
    t     = ma.tanh(drive * e);
    slope = 1 - t * t;
    u     = (x - k * (t / drive - slope * e) - k * slope * (S - c * x)) / (1 + k * slope * G);
    v1 = g * (u - s1);  l1 = v1 + s1;
    v2 = g * (l1 - s2); l2 = v2 + s2;
    v3 = g * (l2 - s3); l3 = v3 + s3;
    v4 = g * (l3 - s4); l4 = v4 + s4;
  };
};

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
// I+II is the Juno-60's own third mode: a fast, nearly mono vibrato (9.75 Hz,
// 3.3 to 3.7 ms), measured by Andy Harman. The Juno's bucket-brigade chips
// also hiss; that hiss is left out on purpose, it is a constant noise floor.
//---------------------------------------------------------------------------
hpfFreq    = hslider("hpf", 10, 10, 2000, 0.1) : sm;
chorusMode = hslider("chorusMode", 1, 0, 3, 1);    // 0 off, 1 I, 2 II, 3 I+II

softLimit(x) = x * (27 + x * x) / (27 + 9 * x * x);
// The Juno-60's filters around its bucket-brigade delay chips: two resonant
// Sallen-Key stages and one simple stage on each side, 5 poles in all. Corners
// and Q as measured on a Juno-60 by Holters and Parker (DAFx 2018) and given
// by the component values of the circuit (22k/22k with 820p/680p and 1n8/270p).
// They roll off far more than one pole: about -38 dB at 15 kHz instead of -12.
sk(f, q)  = fi.tf2s(0, 0, 1, 1 / q, 1, 2 * ma.PI * f);   // 2-pole low-pass, corner f, quality q
pole(f)   = fi.lowpass(1, min(f, 0.45 * ma.SR));
bbdIn     = sk(9691, 0.549) : sk(10344, 1.236) : pole(7413);
bbdOut    = sk(8874, 0.542) : sk(10381, 1.241) : pole(28053);
tri(f)       = (os.lf_triangle(f) + 1) / 2;         // unipolar triangle, like SimpleLFO::triangle_uni
p1 = tri(0.513);                                    // chorus I rate
p2 = tri(0.863);                                    // chorus II rate
p3 = tri(9.75);                                     // I+II vibrato rate
maxDelay = 1024;                                    // samples: the longest tap is 5.4 ms, 519 samples at 96 kHz
// The measured delays are those of the whole chorus. The two filters above
// delay the signal by about 0.115 ms themselves, so the delay line is shorter.
filtDelay = 0.000115;
tL(p) = (0.00154 - filtDelay + (0.00515 - 0.00154) * p) * ma.SR;
tR(p) = (0.00151 - filtDelay + (0.00540 - 0.00151) * p) * ma.SR;
tV(p) = (0.0033 - filtDelay + 0.0004 * p) * ma.SR;         // I+II: 3.3 to 3.7 ms in all
gA  = ba.selectn(4, chorusMode, 0, 1, 0, 0);        // chorus I share
gB  = ba.selectn(4, chorusMode, 0, 0, 1, 0);        // chorus II share
gV  = chorusMode == 3;                              // I+II vibrato
on  = chorusMode > 0;
dry = 1;                                            // the Juno-60 adds the delayed signal at full
wet = select2(on, 0, 1);                            // level: chorus on is about 3 dB louder

// Each chorus has a left tap swept by p and a right tap swept by 1-p
chorus(x) = outL, outR
with {
  pre  = x : softLimit : bbdIn;                    // anti-alias filter before the BBD
  a1L  = de.fdelay(maxDelay, tL(p1), pre);
  a1R  = de.fdelay(maxDelay, tR(1 - p1), pre);
  a2L  = de.fdelay(maxDelay, tL(p2), pre);
  a2R  = de.fdelay(maxDelay, tR(1 - p2), pre);
  a3L  = de.fdelay(maxDelay, tV(p3), pre);
  a3R  = a3L;                                       // I+II is one vibrato on both sides
  wL   = (a1L * gA + a2L * gB + a3L * gV) : bbdOut;   // reconstruction filter
  wR   = (a1R * gA + a2R * gB + a3R * gV) : bbdOut;
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

// HPF: one pole (6 dB per octave), as on the Juno-60
effect = fi.highpass(1, hpfFreq) : drive : chorus : reverb : *(outGain), *(outGain) : limiter;
