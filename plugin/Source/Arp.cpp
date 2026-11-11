#include "Arp.h"

#include <algorithm>
#include <cmath>

namespace halden6
{
namespace
{
    bool contains (const std::vector<int>& v, int x) { return std::find (v.begin(), v.end(), x) != v.end(); }
    void erase (std::vector<int>& v, int x) { v.erase (std::remove (v.begin(), v.end(), x), v.end()); }
}

void Arp::prepare (double sampleRate)
{
    sr = sampleRate;
    held.reserve (128); down.reserve (128); consumed.reserve (128);
    seqNotes.reserve (128 * 8); seqVels.reserve (128 * 8);
    offs.reserve (256);
    pendingOn.reserve (256);
    stopAll();
    offs.clear();
    clock = 0;
    synced = false;
}

void Arp::setPattern (const ArpPattern& p)
{
    pattern = p;
    pattern.length = std::clamp (pattern.length, 1, 16);
}

void Arp::setSettings (const ArpSettings& s)
{
    if (settings.on && ! s.on)
    {
        held.clear();
        stop();
    }
    if (settings.latch && ! s.latch)
    {
        held.erase (std::remove_if (held.begin(), held.end(), [this] (int n) { return ! contains (down, n); }), held.end());
        if (held.empty())
            stop();
    }
    if (settings.mode != s.mode)
        arpIdx = 0;
    if (settings.rate != s.rate)
        synced = false;
    settings = s;
}

// ---------------------------------------------------------------- keys

bool Arp::keyDown (int note, float velocity)
{
    if (! settings.on || note < 0 || note > 127)
        return false;
    if (settings.latch && down.empty())
        held.clear();   // a new chord replaces the latched one
    if (! contains (down, note)) down.push_back (note);
    if (! contains (consumed, note)) consumed.push_back (note);
    vels[(size_t) note] = velocity;
    if (! contains (held, note))
        held.push_back (note);
    if (! running)
        start();
    return true;
}

bool Arp::keyUp (int note)
{
    erase (down, note);
    if (! contains (consumed, note))
        return false;
    erase (consumed, note);
    if (! settings.latch)
    {
        erase (held, note);
        if (held.empty())
            stop();
    }
    return true;
}

void Arp::stopAll()
{
    held.clear(); down.clear(); consumed.clear();
    offs.clear();
    stop();
}

void Arp::start()
{
    running = true;
    starting = true;
    arpIdx = 0;
}

void Arp::stop()
{
    running = false;
    starting = false;
    playheadStep = -1;
}

// ---------------------------------------------------------------- steps

// arpSequence() in arp.js
void Arp::buildSequence()
{
    seqNotes.assign (held.begin(), held.end());           // played order
    if (settings.order != 4)
        std::sort (seqNotes.begin(), seqNotes.end());
    const size_t baseSize = seqNotes.size();
    seqVels.clear();
    for (size_t i = 0; i < baseSize; ++i)
        seqVels.push_back (vels[(size_t) seqNotes[i]] > 0.0f ? vels[(size_t) seqNotes[i]] : 0.8f);
    for (int o = 1; o < settings.octaves; ++o)
        for (size_t i = 0; i < baseSize; ++i)
        {
            seqNotes.push_back (seqNotes[i] + 12 * o);
            seqVels.push_back (seqVels[i]);
        }
    if (settings.order == 1)
    {
        std::reverse (seqNotes.begin(), seqNotes.end());
        std::reverse (seqVels.begin(), seqVels.end());
    }
    else if (settings.order == 2 && seqNotes.size() > 2)
    {
        // up, then back down without repeating the top and bottom notes
        for (size_t i = seqNotes.size() - 2; i >= 1; --i)
        {
            seqNotes.push_back (seqNotes[i]);
            seqVels.push_back (seqVels[i]);
        }
    }
}

void Arp::trigger (int64_t step, int64_t when, double stepSamples)
{
    if (held.empty())
        return;

    int note;
    float vel;
    double dur;
    if (settings.mode == 1)
    {
        const int si = (int) (((step % pattern.length) + pattern.length) % pattern.length);
        playheadStep = si;
        const auto& st = pattern.steps[(size_t) si];
        if (! st.on)
            return;
        note = st.note + held.back() - kRoot;
        vel = st.vel;
        dur = st.tie ? stepSamples * 1.05 : stepSamples * (0.05 + st.gate * 0.95);
    }
    else
    {
        playheadStep = -1;
        buildSequence();
        const size_t n = seqNotes.size();
        const size_t pick = settings.order == 3 ? (size_t) (rng() % n) : (size_t) (arpIdx % (int64_t) n);
        ++arpIdx;
        note = seqNotes[pick];
        vel = seqVels[pick];
        dur = stepSamples * (0.05 + settings.gate * 0.95);
    }
    note = std::clamp (note, 0, 127);
    offs.push_back ({ when + std::max<int64_t> (1, std::llround (dur)), note });
    pendingOn.push_back ({ (int) (when - clock), true, note, vel });
}

void Arp::advance (int n, const ArpTime& time, std::vector<ArpEvent>& out)
{
    out.clear();
    pendingOn.clear();
    const int64_t end = clock + n;
    const double bpm = std::clamp (time.bpm, 20.0, 999.0);
    const double samplesPerBeat = sr * 60.0 / bpm;
    const double spb = kStepsPerBeat[std::clamp (settings.rate, 0, 5)];
    const double stepSamples = samplesPerBeat / spb;

    if (time.playing)
    {
        const double p0 = time.ppq;
        // Align to the grid on the first block, after a jump or loop, or a rate change
        const bool jumped = std::abs (p0 - expectedPpq) > 0.5 / samplesPerBeat + 1e-9;
        if (running && (! synced || ! wasPlaying || jumped || starting))
        {
            // the first step (with its swing) at or after the host's position
            const double pos = p0 * spb;
            nextGrid = (int64_t) std::floor (pos) - 1;
            while (((double) nextGrid + swingShift (nextGrid)) < pos - 1e-9)
                ++nextGrid;
            // a key pressed just after a step still catches it
            if (starting && pos - std::floor (pos) < 0.15 && nextGrid > (int64_t) std::floor (pos))
                nextGrid = (int64_t) std::floor (pos);
            synced = true;
            anchorBpm = 0.0;   // re-anchor below
        }
        if (anchorBpm != bpm)
        {
            anchorClock = clock;
            anchorPpq = p0;
            anchorBpm = bpm;
        }
        starting = false;
        if (running)
        {
            for (;;)
            {
                const double stepPpq = ((double) nextGrid + swingShift (nextGrid)) / spb;
                const int64_t when = std::max (clock, anchorClock + (int64_t) std::llround ((stepPpq - anchorPpq) * samplesPerBeat));
                if (when >= end)
                    break;
                trigger (nextGrid, when, stepSamples);
                ++nextGrid;
            }
        }
        expectedPpq = p0 + n / samplesPerBeat;
        wasPlaying = true;
        // where the next step falls in samples, if the host stops now
        freeStep = nextGrid;
        freeNext = (double) end + (((double) nextGrid / spb) - expectedPpq) * samplesPerBeat;
    }
    else
    {
        if (starting)
        {
            freeNext = (double) clock;   // the first step sounds with the key
            freeStep = 0;
            starting = false;
        }
        if (running)
        {
            for (;;)
            {
                const double t = freeNext + swingShift (freeStep) * stepSamples;
                const int64_t when = std::max (clock, (int64_t) std::ceil (t - 1e-6));
                if (when >= end)
                    break;
                trigger (freeStep, when, stepSamples);
                freeNext += stepSamples;   // the step length at the time it is played, as in arp.js
                ++freeStep;
            }
        }
        wasPlaying = false;
        synced = false;
    }

    // note-offs that fall in this span
    for (size_t i = 0; i < offs.size();)
    {
        if (offs[i].time < end)
        {
            out.push_back ({ (int) std::max<int64_t> (0, offs[i].time - clock), false, offs[i].note, 0.0f });
            offs[i] = offs.back();
            offs.pop_back();
        }
        else
            ++i;
    }
    for (const auto& e : pendingOn)
        out.push_back (e);
    std::stable_sort (out.begin(), out.end(), [] (const ArpEvent& a, const ArpEvent& b) {
        return a.offset != b.offset ? a.offset < b.offset : (! a.on && b.on);
    });
    clock = end;
}
} // namespace halden6
