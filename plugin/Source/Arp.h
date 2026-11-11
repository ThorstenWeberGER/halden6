// The arpeggiator's clock and rules, in C++ so they run in the audio callback.
// A port of the engine part of arp.js (the panel keeps the editor). No JUCE.
//
// The rules, the same in both:
//   - Arp mode plays the held keys in the chosen order over 1-4 octaves.
//     Orders: up, down, up-down (ends not repeated), random, as played.
//   - Pattern mode plays the 16-step pattern. Holding C4 plays it as written;
//     the last key pressed transposes it.
//   - A step lasts one beat / (1, 2, 3, 4, 6, 8) for 1/4, 1/8, 1/8T, 1/16,
//     1/16T, 1/32. Swing delays every second step by swing x 0.33 steps.
//   - A note lasts (0.05 + gate x 0.95) steps; a tied pattern step 1.05 steps.
//   - Latch keeps playing after the keys are released; a new chord, pressed
//     after all keys were up, replaces the latched one.
//   - The arp takes the keys only while it is on. Keys pressed while it was on
//     stay with it until released.
//
// Plugin only:
//   - While the host plays, steps sit on the host's grid (pattern step 1 on
//     the bar when the pattern fills a bar), and a key pressed just after a
//     step still catches that step. When the host is stopped, the arp runs on
//     at the host's tempo, starting with the key press.
//   - Time is counted in samples only, never with a wall clock, so exporting
//     or freezing faster than real time gives the same notes.
#pragma once

#include <array>
#include <cstdint>
#include <random>
#include <vector>

namespace halden6
{
struct ArpStep
{
    bool on = false;
    int note = 60;
    float vel = 0.8f;
    float gate = 0.75f;
    bool tie = false;
};

struct ArpPattern
{
    int length = 16;
    std::array<ArpStep, 16> steps {};
};

struct ArpSettings
{
    bool on = false;
    int mode = 0;        // 0 Arp, 1 Pattern
    bool latch = false;
    int rate = 3;        // index into kStepsPerBeat
    float swing = 0.0f;
    int order = 0;       // up, down, up-dn, random, played
    int octaves = 1;
    float gate = 0.7f;
};

// The host's tempo, and its musical position (in quarter notes) at the start
// of the samples being advanced, when it is playing
struct ArpTime
{
    double bpm = 120.0;
    bool playing = false;
    double ppq = 0.0;
};

struct ArpEvent
{
    int offset;      // samples from the start of the advanced span
    bool on;
    int note;
    float vel;
};

class Arp
{
public:
    static constexpr int kRoot = 60;   // C4 plays a pattern untransposed
    static constexpr int kStepsPerBeat[] = { 1, 2, 3, 4, 6, 8 };

    void prepare (double sampleRate);
    void setSettings (const ArpSettings& s);   // once per block, before the keys
    void setPattern (const ArpPattern& p);

    // A key from MIDI or the panel. true: the arp took it, so it must not
    // also sound directly
    bool keyDown (int note, float velocity);
    bool keyUp (int note);
    void stopAll();

    // The notes to play in the next n samples, sorted by offset (note-offs
    // before note-ons at the same sample)
    void advance (int n, const ArpTime& time, std::vector<ArpEvent>& out);

    int playhead() const { return playheadStep; }   // pattern step playing, or -1
    bool isRunning() const { return running; }

private:
    void start();
    void stop();
    void trigger (int64_t step, int64_t when, double stepSamples);
    void buildSequence();
    double swingShift (int64_t step) const { return (step & 1) ? settings.swing * 0.33 : 0.0; }

    double sr = 48000.0;
    ArpSettings settings;
    ArpPattern pattern;

    std::vector<int> held, down, consumed;
    std::vector<int> seqNotes;        // the arp sequence: notes with the velocity of their key
    std::vector<float> seqVels;
    std::vector<ArpEvent> pendingOn;
    std::array<float, 128> vels {};
    bool running = false, starting = false;
    int64_t arpIdx = 0;
    int playheadStep = -1;

    int64_t clock = 0;              // samples advanced so far
    bool wasPlaying = false;
    bool synced = false;            // on the host grid
    int64_t nextGrid = 0;           // next step index on the host grid
    double expectedPpq = 0.0;       // host position at `clock`, to notice loops and jumps
    // Step times are counted from one fixed point (set when aligning or when the
    // tempo changes), not from each block's start, so how the host cuts the
    // audio into blocks cannot move a note by a sample
    int64_t anchorClock = 0;
    double anchorPpq = 0.0, anchorBpm = 0.0;
    double freeNext = 0.0;          // free running: sample time of the next step (before swing)
    int64_t freeStep = 0;

    struct Pending { int64_t time; int note; };
    std::vector<Pending> offs;
    std::minstd_rand rng { 1234567 };
};
} // namespace halden6
