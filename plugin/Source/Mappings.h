// Fader positions to the real units halden6.dsp expects (Hz, seconds, cents).
// A C++ copy of dspValues() in mapping.js. Keep the two in step:
// plugin/tools/check.mjs compares them on random panel settings.
#pragma once

#include "generated/Parameters.h"
#include <cmath>

namespace halden6
{
// What the panel holds besides the DAW parameters
struct Performance
{
    float pitchWheel = 0.0f;   // -1..1, from MIDI pitch bend
    double bpm = 120.0;        // host tempo, for LFO tempo sync
};

// One entry per Faust control, in the order of kDspNames
struct DspValues
{
    enum Index
    {
        pitchCents, glide, sawOn, pulseOn, subOn, subLevel, noiseLevel, pwmAmt, pwmMode,
        lfoRate, lfoWave, lfoDelay, lfoRetrig, lfoPitch, cutoff, res, envAmt, lfoFilt, kybd,
        bendVcf, attack, decay, sustain, release, vcaGate, velEnv, hpf, chorusMode,
        revMix, revTime, texture, fm, outGain,
        kCount
    };
    double v[kCount] {};
};

// Faust control labels, the same names synth.js sends
inline const char* const kDspNames[DspValues::kCount] = {
    "pitchCents", "glide", "sawOn", "pulseOn", "subOn", "subLevel", "noiseLevel", "pwmAmt", "pwmMode",
    "lfoRate", "lfoWave", "lfoDelay", "lfoRetrig", "lfoPitch", "cutoff", "res", "envAmt", "lfoFilt", "kybd",
    "bendVcf", "attack", "decay", "sustain", "release", "vcaGate", "velEnv", "hpf", "chorusMode",
    "revMix", "revTime", "texture", "fm", "outGain",
};

constexpr double kOutMakeup = 5.1;   // +14 dB, as OUT_MAKEUP in synth.js

inline double expMap (double v, double min, double max) { return min * std::pow (max / min, v); }

inline DspValues dspValues (const float* p, const Performance& perf)
{
    static constexpr double tempoBeats[] = { 0, 4, 2, 1, 0.5, 0.25 };   // '----', 1/1 .. 1/16
    auto P = [p] (int i) { return (double) p[i]; };
    auto I = [p] (int i) { return (int) std::lround (p[i]); };

    const int tempo = I (P_lfoTempo);
    const bool c1 = I (P_chorus1) != 0, c2 = I (P_chorus2) != 0;

    DspValues d;
    auto& v = d.v;
    v[DspValues::pitchCents] = P (P_tune) * 100 + perf.pitchWheel * P (P_bendDco) * 1200;
    v[DspValues::glide] = I (P_gml) ? 0.08 : 0;
    v[DspValues::sawOn] = I (P_dcoSaw);
    v[DspValues::pulseOn] = I (P_dcoPulse);
    v[DspValues::subOn] = I (P_dcoSub);
    v[DspValues::subLevel] = P (P_dcoSubLevel);
    v[DspValues::noiseLevel] = P (P_dcoNoise);
    v[DspValues::pwmAmt] = P (P_dcoPwm) * 0.45;
    v[DspValues::pwmMode] = I (P_dcoPwmMod) == 1 ? 0 : (I (P_dcoPwmSource) == 0 ? 1 : 2);
    v[DspValues::lfoRate] = tempo > 0 && tempo <= 5 ? (perf.bpm / 60) / tempoBeats[tempo]
                                                    : expMap (P (P_lfoRate), 0.1, 20);
    v[DspValues::lfoWave] = I (P_lfoWave);
    v[DspValues::lfoDelay] = P (P_lfoDelay) * 3;
    v[DspValues::lfoRetrig] = I (P_lfoTrig) == 0 ? 1 : 0;
    v[DspValues::lfoPitch] = P (P_dcoLfo) * P (P_dcoLfo) * 600;
    v[DspValues::cutoff] = expMap (P (P_vcfFreq), 30, 18000);
    v[DspValues::res] = P (P_vcfRes);
    v[DspValues::envAmt] = (I (P_vcfEnvPolarity) == 0 ? 1 : -1) * P (P_vcfEnv) * 7200;
    v[DspValues::lfoFilt] = P (P_vcfLfo) * P (P_vcfLfo) * 4800;
    v[DspValues::kybd] = P (P_vcfKybd);
    v[DspValues::bendVcf] = perf.pitchWheel * P (P_bendVcf) * 4800;
    v[DspValues::attack] = expMap (P (P_envA), 0.001, 3);
    v[DspValues::decay] = expMap (P (P_envD), 0.005, 10);
    v[DspValues::sustain] = P (P_envS);
    v[DspValues::release] = expMap (P (P_envR), 0.005, 10);
    v[DspValues::vcaGate] = I (P_vcaMode);
    v[DspValues::velEnv] = P (P_velocityEnv);
    v[DspValues::hpf] = expMap (P (P_hpfFreq), 10, 1500);
    v[DspValues::chorusMode] = c1 && c2 ? 3 : c2 ? 2 : c1 ? 1 : 0;
    v[DspValues::revMix] = P (P_revMix) * P (P_revMix);
    v[DspValues::revTime] = expMap (P (P_revLength), 0.3, 12);
    v[DspValues::texture] = P (P_texture);
    v[DspValues::fm] = P (P_fm);
    v[DspValues::outGain] = kOutMakeup * P (P_vcaLevel) * 1.2 * P (P_volume) * P (P_volume);
    return d;
}
} // namespace halden6
