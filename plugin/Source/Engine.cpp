#include "Engine.h"

#include "FaustGlue.h"

// Generated code: not ours to tidy, so keep its warnings out of the build log
#if defined (__clang__) || defined (__GNUC__)
 #pragma GCC diagnostic push
 #pragma GCC diagnostic ignored "-Wunused-parameter"
 #pragma GCC diagnostic ignored "-Wfloat-equal"
 #pragma GCC diagnostic ignored "-Wshadow"
 #pragma GCC diagnostic ignored "-Wconversion"
 #pragma GCC diagnostic ignored "-Wsign-conversion"
#elif defined (_MSC_VER)
 #pragma warning (push, 0)
#endif
#include "generated/Halden6Voice.h"
#include "generated/Halden6Effect.h"
#if defined (__clang__) || defined (__GNUC__)
 #pragma GCC diagnostic pop
#elif defined (_MSC_VER)
 #pragma warning (pop)
#endif

#include <algorithm>
#include <cmath>
#include <cstring>
#include <limits>

namespace halden6
{
namespace
{
    // Voice states, as in faustwasm. A playing voice holds its MIDI note (>= 0).
    constexpr int kFree = -1, kRelease = -2, kLegato = -3, kNoVoice = -4;
    constexpr int kFade = 64;                  // steal crossfade: 64 frames out, 64 in
    constexpr int kLevelWindow = 128;          // frames per "is this voice silent" check
    constexpr float kStopLevel = 3.162e-5f;    // -90 dB: a releasing voice below this is freed

    bool isOn (float v) { return v > 0.5f; }
    bool differs (double a, double b) { return std::memcmp (&a, &b, sizeof (double)) != 0; }
}

struct Engine::Voice
{
    Halden6Voice dsp;
    float* freq = nullptr;
    float* gate = nullptr;
    float* gain = nullptr;
    float* zones[DspValues::kCount] {};

    int curNote = kFree;
    int nextNote = -1, nextVel = 0;   // the note waiting for a steal crossfade
    uint64_t date = 0;
    int fadeOut = 0;                  // frames of the fade-out done
    int fadeIn = kFade;               // frames of the fade-in done (kFade = none running)
    float windowMax = 0.0f;
    int windowCount = 0;

    void start (int note, int velocity)
    {
        *freq = 440.0f * std::pow (2.0f, (float) (note - 69) / 12.0f);
        *gate = 1.0f;
        *gain = (float) velocity / 127.0f;
        curNote = note;
    }
};

Engine::Engine() = default;
Engine::~Engine() = default;

void Engine::prepare (int sampleRate, int maxBlock)
{
    voices.clear();
    for (int i = 0; i < kMaxVoices; ++i)
    {
        auto v = std::make_unique<Voice>();
        v->dsp.init (sampleRate);
        ZoneMap map;
        v->dsp.buildUserInterface (&map);
        v->freq = map.find ("freq");
        v->gate = map.find ("gate");
        v->gain = map.find ("gain");
        for (int k = 0; k < DspValues::kCount; ++k)
            v->zones[k] = map.find (kDspNames[k]);
        voices.push_back (std::move (v));
    }

    effect = std::make_unique<Halden6Effect>();
    effect->init (sampleRate);
    ZoneMap map;
    effect->buildUserInterface (&map);
    for (int k = 0; k < DspValues::kCount; ++k)
        effectZones[k] = map.find (kDspNames[k]);

    mix.assign ((size_t) std::max (1, maxBlock), 0.0f);
    scratch.assign ((size_t) std::max (1, maxBlock), 0.0f);
    sounding.clear();
    held.clear();
    sounding.reserve (64);
    held.reserve (128);
    date = 0;
    firstPush = true;
    setPanel (params, perf);
}

// ---------------------------------------------------------------- panel

void Engine::setPanel (const float* newParams, const Performance& newPerf)
{
    const bool monoChanged = ! firstPush
        && (isOn (newParams[P_ml]) != isOn (params[P_ml]) || isOn (newParams[P_gml]) != isOn (params[P_gml]));
    if (newParams != params)
        std::copy (newParams, newParams + kNumParams, params);
    perf = newPerf;
    if (monoChanged)
        panic();
    if (voices.empty())
        return;

    const DspValues d = dspValues (params, perf);
    for (int k = 0; k < DspValues::kCount; ++k)
    {
        if (! firstPush && ! differs (d.v[k], sent.v[k]))
            continue;
        const auto value = (float) d.v[k];
        for (auto& v : voices)
            if (v->zones[k] != nullptr)
                *v->zones[k] = value;
        if (effectZones[k] != nullptr)
            *effectZones[k] = value;
        sent.v[k] = d.v[k];
    }
    firstPush = false;
}

// ---------------------------------------------------------------- note logic (synth.js)

bool Engine::isMono() const { return isOn (params[P_ml]) || isOn (params[P_gml]); }

void Engine::keyOn (int note, float velocity)
{
    const size_t limit = isMono() ? 1 : (size_t) std::clamp ((int) std::lround (params[P_voices]), 1, kMaxVoices);
    while (sounding.size() >= limit)
    {
        poolKeyOff (sounding.front());
        sounding.erase (sounding.begin());
    }
    poolKeyOn (note, std::max (1, (int) std::lround (velocity * 127.0f)));
    sounding.push_back (note);
}

void Engine::keyOff (int note)
{
    auto it = std::find (sounding.begin(), sounding.end(), note);
    if (it == sounding.end())
        return;
    sounding.erase (it);
    poolKeyOff (note);
}

void Engine::noteOn (int note, float velocity)
{
    if (isMono())
    {
        held.erase (std::remove (held.begin(), held.end(), note), held.end());
        held.push_back (note);
    }
    else if (std::find (sounding.begin(), sounding.end(), note) != sounding.end())
    {
        keyOff (note);
    }
    keyOn (note, velocity);
}

void Engine::noteOff (int note)
{
    if (isMono())
    {
        const bool wasTop = ! held.empty() && held.back() == note;
        held.erase (std::remove (held.begin(), held.end(), note), held.end());
        if (wasTop && ! held.empty())
        {
            keyOn (held.back(), 0.8f);
            return;
        }
    }
    keyOff (note);
}

void Engine::panic()
{
    held.clear();
    sounding.clear();
    // soft: voices fade out with their release, as in synth.js
    poolAllNotesOff();
}

// ---------------------------------------------------------------- voice pool (faustwasm)

int Engine::getFreeVoice()
{
    for (int i = 0; i < (int) voices.size(); ++i)
    {
        if (voices[(size_t) i]->curNote == kFree)
        {
            voices[(size_t) i]->date = date++;
            return i;
        }
    }

    // All busy: steal the oldest releasing voice, else the oldest playing one
    int release = kNoVoice, playing = kNoVoice;
    uint64_t oldestRelease = std::numeric_limits<uint64_t>::max(), oldestPlaying = oldestRelease;
    for (int i = 0; i < (int) voices.size(); ++i)
    {
        const auto& v = *voices[(size_t) i];
        if (v.curNote == kRelease)
        {
            if (v.date < oldestRelease) { oldestRelease = v.date; release = i; }
        }
        else if (v.date < oldestPlaying)
        {
            oldestPlaying = v.date;
            playing = i;
        }
    }
    const int i = release != kNoVoice ? release : playing;
    if (i == kNoVoice)
        return kNoVoice;
    auto& v = *voices[(size_t) i];
    v.date = date++;
    if (v.curNote != kLegato)
        v.fadeOut = 0;
    v.curNote = kLegato;
    return i;
}

void Engine::poolKeyOn (int note, int velocity127)
{
    const int i = getFreeVoice();
    if (i == kNoVoice)
        return;
    auto& v = *voices[(size_t) i];
    if (v.curNote == kLegato)
    {
        v.nextNote = note;
        v.nextVel = velocity127;
    }
    else
    {
        v.fadeIn = kFade;
        v.start (note, velocity127);
    }
}

void Engine::poolKeyOff (int note)
{
    // The oldest voice playing this note, or waiting to play it after a steal
    Voice* found = nullptr;
    for (auto& v : voices)
        if ((v->curNote == note || (v->curNote == kLegato && v->nextNote == note))
            && (found == nullptr || v->date < found->date))
            found = v.get();
    if (found != nullptr)
    {
        *found->gate = 0.0f;
        found->curNote = kRelease;
    }
}

void Engine::poolAllNotesOff()
{
    for (auto& v : voices)
    {
        *v->gate = 0.0f;
        v->curNote = kRelease;
    }
}

// ---------------------------------------------------------------- audio

void Engine::renderVoice (Voice& v, float* out, int n)
{
    int done = 0;
    while (done < n)
    {
        // Pieces end on the 128-frame level windows, so a finished voice is
        // freed at the same sample however the host cuts the audio
        int m = std::min (n - done, kLevelWindow - v.windowCount);
        float* buf = scratch.data();
        float* outs[] = { buf };

        if (v.curNote == kLegato)
        {
            // Hand-over of a stolen voice: the old note fades out with its gate
            // closed, then the new note starts and fades in. The DSP state
            // carries on, so both fades are needed to avoid a step.
            if (v.fadeOut == 0)
                *v.gate = 0.0f;
            m = std::min (m, kFade - v.fadeOut);
            v.dsp.compute (m, nullptr, outs);
            for (int i = 0; i < m; ++i)
                buf[i] *= 1.0f - (float) (v.fadeOut + i + 1) / (float) kFade;
            v.fadeOut += m;
            if (v.fadeOut >= kFade)
            {
                v.fadeOut = 0;
                v.fadeIn = 0;
                v.start (v.nextNote, v.nextVel);
            }
        }
        else if (v.fadeIn < kFade)
        {
            m = std::min (m, kFade - v.fadeIn);
            v.dsp.compute (m, nullptr, outs);
            for (int i = 0; i < m; ++i)
                buf[i] *= (float) (v.fadeIn + i + 1) / (float) kFade;
            v.fadeIn += m;
        }
        else
        {
            v.dsp.compute (m, nullptr, outs);
        }

        for (int i = 0; i < m; ++i)
        {
            out[done + i] += buf[i];
            v.windowMax = std::max (v.windowMax, std::abs (buf[i]));
        }
        done += m;

        v.windowCount += m;
        if (v.windowCount >= kLevelWindow)
        {
            if (v.curNote == kRelease && v.windowMax < kStopLevel)
                v.curNote = kFree;
            v.windowMax = 0.0f;
            v.windowCount = 0;
        }
        if (v.curNote == kFree)
            return;
    }
}

void Engine::render (float* left, float* right, int numSamples)
{
    const int maxBlock = (int) mix.size();
    for (int start = 0; start < numSamples; start += maxBlock)
    {
        const int n = std::min (maxBlock, numSamples - start);
        std::fill (mix.begin(), mix.begin() + n, 0.0f);
        for (auto& v : voices)
            if (v->curNote != kFree)
                renderVoice (*v, mix.data(), n);

        float* ins[] = { mix.data() };
        float* outs[] = { left + start, right + start };
        effect->compute (n, ins, outs);

        for (int i = start; i < start + n; ++i)
        {
            if (! std::isfinite (left[i])) left[i] = 0.0f;
            if (! std::isfinite (right[i])) right[i] = 0.0f;
        }
    }
}

int Engine::activeVoices() const
{
    int n = 0;
    for (auto& v : voices)
        n += v->curNote != kFree ? 1 : 0;
    return n;
}
} // namespace halden6
