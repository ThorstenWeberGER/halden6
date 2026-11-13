// The Halden 6 sound engine without JUCE: six Faust voices, the Faust effect
// (HPF, chorus, output gain, limiter) and the note logic of synth.js.
//
// Two layers, as in the web version:
//   - Note logic (synth.js): the Voices limit, mono modes ML / G-ML, retrigger.
//   - Voice pool (faustwasm's poly DSP): which of the six DSP voices plays a
//     note, freeing voices once their release has died away, and stealing the
//     oldest voice with a short crossfade when all six are busy.
#pragma once

#include "Mappings.h"
#include <cstdint>
#include <memory>
#include <vector>

class Halden6Voice;
class Halden6Effect;

namespace halden6
{
class Engine
{
public:
    static constexpr int kMaxVoices = 6;   // MAX_VOICES in synth.js

    Engine();
    ~Engine();

    // Not real-time safe: allocates. maxBlock is the largest render() call.
    void prepare (int sampleRate, int maxBlock);

    // Panel state. Cheap when nothing changed; call once per block.
    void setPanel (const float* params, const Performance& perf);

    // Note logic from synth.js. velocity is 0..1.
    void noteOn (int note, float velocity);
    void noteOff (int note);
    void panic();

    // A note from the arpeggiator: keyed on and off as it is, with the Voices
    // limit and mono modes, but without the retrigger and note-stack rules of
    // a played key (as Synth.trigger in synth.js)
    void triggerOn (int note, float velocity) { keyOn (note, velocity); }
    void triggerOff (int note) { keyOff (note); }

    // Adds nothing: writes numSamples of stereo output (n <= maxBlock)
    void render (float* left, float* right, int numSamples);

    int activeVoices() const;

private:
    struct Voice;

    // voice pool (port of FaustPolyWebAudioDsp in faustwasm)
    void poolKeyOn (int note, int velocity127);
    void poolKeyOff (int note);
    void poolAllNotesOff();
    int getFreeVoice();
    void renderVoice (Voice& v, float* mix, int n);

    // note logic (port of synth.js)
    bool isMono() const;
    void keyOn (int note, float velocity);
    void keyOff (int note);

    std::vector<std::unique_ptr<Voice>> voices;
    std::unique_ptr<Halden6Effect> effect;
    std::vector<float> mix, scratch;
    float* effectZones[DspValues::kCount] {};   // the effect's controls, by DspValues index
    uint64_t date = 0;
    uint64_t framePos = 0;   // frames rendered since prepare(): the grid of the level windows

    float params[kNumParams] {};
    Performance perf;
    DspValues sent;
    bool firstPush = true;

    std::vector<int> sounding;   // notes keyed on, oldest first
    std::vector<int> held;       // note stack for mono modes
};
} // namespace halden6
