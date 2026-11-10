// Juno voice, written in Faust. One instance per voice; faustwasm runs six.
// Every building block comes from the Faust standard libraries:
//   os.sawtooth / os.pulsetrain / os.square  band-limited oscillators (no aliasing)
//   ve.moogLadder                             4-pole ladder filter model (STK-4.3 licence)
//   en.adsr / en.asr                          envelopes
//   os.lf_sawpos_reset                        LFO phase that can restart on each note
// Controls arrive in real units (Hz, seconds, cents) from synth.js, which owns
// the mapping from fader positions, so the UI graphs and the sound agree.
// After editing, rebuild with:  node dsp/build.mjs   (see dsp/README.md)

declare name "juno";
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
osc   = os.sawtooth(fm) * sawOn * 0.35
      + os.pulsetrain(fm, duty) * pulseOn * 0.35
      + os.square(fm * 0.5) * subOn * subLevel * 0.4
      + no.noise * noiseLevel * 0.3;

// Filter: cutoff moved by envelope, LFO, keyboard tracking and pitch wheel
note   = ba.hz2midikey(freq);
fc     = cutoff * pow(2, (envAmt * env * vel + lfoFilt * lfo + kybd * (note - 60) * 100 + bendVcf) / 1200)
       : max(20) : min(18000);
filt   = osc : ve.moogLadder(log10(fc / 20) / 3, 0.707 + res * res * 22);

// VCA: envelope, or a plain on/off gate
amp = select2(vcaGate, env, en.asr(0.003, 1, 0.01, gate));

process = filt * amp * vel * 0.6;
