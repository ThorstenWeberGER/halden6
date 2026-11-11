// Loads the built Halden 6 .vst3 the way a DAW does and plays it.
//
//   Halden6HostTest "<path>/Halden 6.vst3"
//
// Checks: it loads as an instrument, lists its parameters, makes sound from
// MIDI, stays below full scale, falls silent after note off, follows
// automation and pitch bend, restores its saved state in a fresh instance,
// and survives several sample rates, odd block sizes and re-inserting.
// Not a replacement for pluginval, which phase 6 adds.

#include <juce_audio_processors/juce_audio_processors.h>
#include <iostream>

namespace
{
int failures = 0;

void check (bool ok, const juce::String& what)
{
    std::cout << (ok ? "  ok   " : "  FAIL ") << what << std::endl;
    if (! ok)
        ++failures;
}

struct Result
{
    float peak = 0.0f;
    double rms = 0.0;
    float lastBlockPeak = 0.0f;
};

// Play `seconds` of audio in blocks of `block`, with `midi` at the start
Result play (juce::AudioPluginInstance& p, double seconds, int block, juce::MidiBuffer midi = {})
{
    const auto sr = p.getSampleRate();
    juce::AudioBuffer<float> buf (2, block);
    Result r;
    double sum = 0;
    long count = 0;
    const int blocks = (int) std::ceil (seconds * sr / block);
    for (int b = 0; b < blocks; ++b)
    {
        buf.clear();
        juce::MidiBuffer m;
        if (b == 0)
            m = midi;
        p.processBlock (buf, m);
        r.lastBlockPeak = 0.0f;
        for (int c = 0; c < 2; ++c)
            for (int i = 0; i < block; ++i)
            {
                const float s = buf.getSample (c, i);
                r.peak = std::max (r.peak, std::abs (s));
                r.lastBlockPeak = std::max (r.lastBlockPeak, std::abs (s));
                sum += (double) s * s;
                ++count;
            }
    }
    r.rms = std::sqrt (sum / (double) std::max (1L, count));
    return r;
}

juce::MidiBuffer chord (std::initializer_list<int> notes, bool on)
{
    juce::MidiBuffer m;
    for (int n : notes)
        m.addEvent (on ? juce::MidiMessage::noteOn (1, n, (juce::uint8) 100) : juce::MidiMessage::noteOff (1, n), 0);
    return m;
}

juce::AudioProcessorParameter* param (juce::AudioPluginInstance& p, const juce::String& name)
{
    for (auto* q : p.getParameters())
        if (q->getName (64) == name)
            return q;
    return nullptr;
}
} // namespace

int main (int argc, char** argv)
{
    if (argc < 2)
    {
        std::cerr << "usage: Halden6HostTest <plugin.vst3>" << std::endl;
        return 2;
    }
    juce::ScopedJuceInitialiser_GUI juce;
    juce::VST3PluginFormat format;
    const juce::String path = juce::File (juce::String (argv[1])).getFullPathName();

    juce::OwnedArray<juce::PluginDescription> found;
    format.findAllTypesForFile (found, path);
    check (found.size() == 1, "the .vst3 contains one plugin");
    if (found.isEmpty())
        return 1;
    const auto desc = *found[0];
    check (desc.isInstrument, "it is listed as an instrument (" + desc.name + ", " + desc.category + ")");

    auto create = [&] (double sr, int block) {
        juce::String error;
        auto p = format.createInstanceFromDescription (desc, sr, block, error);
        if (p == nullptr)
            std::cout << "  error: " << error << std::endl;
        else
        {
            p->enableAllBuses();
            p->setPlayConfigDetails (0, 2, sr, block);
            p->prepareToPlay (sr, block);
        }
        return p;
    };

    // ---- basics at 48 kHz, 512-frame blocks
    std::cout << "Basics, 48 kHz, 512 frames" << std::endl;
    auto p = create (48000, 512);
    check (p != nullptr, "an instance can be created");
    if (p == nullptr)
        return 1;
    check (p->acceptsMidi() && p->getTotalNumOutputChannels() == 2, "MIDI in, stereo out");
    int own = 0;
    for (auto* q : p->getParameters())
        own += q->getName (64).startsWith ("MIDI CC") ? 0 : 1;
    check (own == 38, "it has 37 sound parameters plus Bypass (" + juce::String (own) + "; JUCE adds hidden MIDI controller slots)");
    check (param (*p, "VCF Freq") != nullptr && param (*p, "ENV R") != nullptr, "parameters carry readable names (VCF Freq, ENV R)");
    check (p->getLatencySamples() == 240, "it reports the limiter's 5 ms lookahead as latency (" + juce::String (p->getLatencySamples()) + " frames)");

    auto r = play (*p, 1.0, 512);
    check (r.peak == 0.0f, "silent without notes");

    r = play (*p, 1.0, 512, chord ({ 48, 55, 60, 64, 67, 72 }, true));
    check (r.rms > 0.01, "a 6-note chord makes sound (RMS " + juce::String (r.rms, 3) + ")");
    check (r.peak <= 0.9f, "the chord stays below full scale (peak " + juce::String (r.peak, 3) + ")");

    if (auto* vol = param (*p, "Volume"))
    {
        vol->setValueNotifyingHost (1.0f);
        if (auto* lvl = param (*p, "VCA Level"))
            lvl->setValueNotifyingHost (1.0f);
        r = play (*p, 1.0, 512);
        check (r.peak <= 0.9f, "at full Volume and Level it still stays below full scale (peak " + juce::String (r.peak, 3) + ")");
    }

    play (*p, 0.1, 512, chord ({ 48, 55, 60, 64, 67, 72 }, false));
    r = play (*p, 12.0, 512);
    check (r.lastBlockPeak < 1e-5f, "silent again after note off and release (last block peak " + juce::String (r.lastBlockPeak) + ")");

    // ---- automation: closing the filter makes it quieter
    std::cout << "Automation and MIDI" << std::endl;
    auto* cutoff = param (*p, "VCF Freq");
    cutoff->setValueNotifyingHost (1.0f);
    const auto open = play (*p, 0.5, 512, chord ({ 60 }, true));
    cutoff->setValueNotifyingHost (0.05f);
    const auto closed = play (*p, 0.5, 512);
    check (closed.rms < open.rms * 0.5, "VCF Freq automation changes the sound (RMS " + juce::String (open.rms, 3) + " -> " + juce::String (closed.rms, 3) + ")");
    cutoff->setValueNotifyingHost (1.0f);
    play (*p, 0.3, 512);

    // pitch bend: count zero crossings of the held note before and after
    auto crossings = [&] (juce::MidiBuffer m) {
        play (*p, 0.1, 512, m);   // let the pitch settle
        juce::AudioBuffer<float> buf (2, 512);
        juce::MidiBuffer none;
        int n = 0;
        float prev = 0.0f;
        for (int b = 0; b < 10; ++b)
        {
            buf.clear();
            p->processBlock (buf, none);
            for (int i = 0; i < 512; ++i)
            {
                n += (prev < 0) != (buf.getSample (0, i) < 0) ? 1 : 0;
                prev = buf.getSample (0, i);
            }
        }
        return n;
    };
    if (auto* bend = param (*p, "Bend DCO"))
        bend->setValueNotifyingHost (1.0f);   // 12 semitones
    const int before = crossings ({});
    juce::MidiBuffer up;
    up.addEvent (juce::MidiMessage::pitchWheel (1, 16383), 0);
    const int after = crossings (up);
    check (after > before * 1.6, "pitch bend up raises the pitch (zero crossings " + juce::String (before) + " -> " + juce::String (after) + ")");
    juce::MidiBuffer stop;
    stop.addEvent (juce::MidiMessage::pitchWheel (1, 8192), 0);
    stop.addEvent (juce::MidiMessage::allNotesOff (1), 0);
    play (*p, 12.0, 512, stop);

    // ---- state: save, load into a fresh instance
    std::cout << "Saved state" << std::endl;
    param (*p, "ENV R")->setValueNotifyingHost (0.9f);
    param (*p, "Chorus II")->setValueNotifyingHost (1.0f);
    param (*p, "LFO Wave")->setValueNotifyingHost (1.0f);   // last option
    param (*p, "Voices")->setValueNotifyingHost (0.4f);
    juce::MemoryBlock saved;
    p->getStateInformation (saved);
    auto q = create (48000, 512);
    q->setStateInformation (saved.getData(), (int) saved.getSize());
    bool same = true;
    for (int i = 0; i < p->getParameters().size(); ++i)
    {
        auto* x = p->getParameters()[i];
        auto* y = q->getParameters()[i];
        if (x->getName (64).startsWith ("MIDI CC"))
            continue;   // JUCE's stand-ins for MIDI controllers, not part of the patch
        if (std::abs (x->getValue() - y->getValue()) >= 1e-6f)
        {
            if (same) std::cout << "  differs: " << x->getName (64) << " " << x->getValue() << " vs " << y->getValue() << std::endl;
            same = false;
        }
    }
    check (same, "a fresh instance restores every parameter from the saved state");
    // A third fresh instance with the same settings made by hand must sound
    // exactly like the restored one (both start from the same DSP state)
    auto byHand = create (48000, 512);
    for (int i = 0; i < p->getParameters().size(); ++i)
        if (! p->getParameters()[i]->getName (64).startsWith ("MIDI CC"))
            byHand->getParameters()[i]->setValueNotifyingHost (p->getParameters()[i]->getValue());
    const auto a = play (*byHand, 0.5, 512, chord ({ 57, 60, 64 }, true));
    const auto b = play (*q, 0.5, 512, chord ({ 57, 60, 64 }, true));
    check (a.rms > 0.01 && std::abs (a.rms - b.rms) < 1e-9, "and sounds the same (RMS " + juce::String (a.rms, 5) + " vs " + juce::String (b.rms, 5) + ")");
    byHand->releaseResources();
    q->releaseResources();
    q.reset();

    // ---- sample rates and block sizes, including odd ones
    std::cout << "Sample rates and block sizes" << std::endl;
    p->releaseResources();
    p.reset();
    for (double sr : { 44100.0, 48000.0, 96000.0 })
        for (int block : { 17, 64, 512, 2048 })
        {
            auto s = create (sr, block);
            auto on = play (*s, 0.5, block, chord ({ 48, 60, 64, 67 }, true));
            play (*s, 0.05, block, chord ({ 48, 60, 64, 67 }, false));
            auto off = play (*s, 12.0, block);
            check (on.rms > 0.01 && on.peak <= 0.9f && off.lastBlockPeak < 1e-5f,
                   juce::String (sr / 1000.0, 1) + " kHz, " + juce::String (block) + " frames: plays (peak " + juce::String (on.peak, 3) + ") and falls silent");
            s->releaseResources();
        }

    // ---- re-insert: create and destroy repeatedly
    for (int i = 0; i < 5; ++i)
    {
        auto s = create (48000, 256);
        play (*s, 0.1, 256, chord ({ 60 }, true));
        s->releaseResources();
    }
    check (true, "5 insert / remove cycles without a crash");

    std::cout << (failures == 0 ? "All host checks passed" : juce::String (failures) + " host checks failed") << std::endl;
    return failures == 0 ? 0 : 1;
}
