#include "PluginProcessor.h"
#include "PluginEditor.h"

using namespace halden6;

namespace
{
    // Bump when the saved state changes shape, so old Live sets can be read
    constexpr int kStateVersion = 1;
}

Halden6Processor::Halden6Processor()
    : AudioProcessor (BusesProperties().withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
      state (*this, nullptr, "Halden6", createLayout())
{
    for (int i = 0; i < kNumParams; ++i)
        raw[i] = state.getRawParameterValue (kParams[i].id);
}

juce::AudioProcessorValueTreeState::ParameterLayout Halden6Processor::createLayout()
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;
    for (const auto& p : kParams)
    {
        const juce::ParameterID id { p.id, 1 };
        const auto name = juce::String::fromUTF8 (p.name);
        switch (p.type)
        {
            case ParamType::Float:
                layout.add (std::make_unique<juce::AudioParameterFloat> (id, name, juce::NormalisableRange<float> (p.min, p.max), p.def));
                break;
            case ParamType::Bool:
                layout.add (std::make_unique<juce::AudioParameterBool> (id, name, p.def > 0.5f));
                break;
            case ParamType::Choice:
            {
                juce::StringArray options;
                for (int i = 0; i < p.numOptions; ++i)
                    options.add (juce::String::fromUTF8 (p.options[i]));
                layout.add (std::make_unique<juce::AudioParameterChoice> (id, name, options, (int) p.def));
                break;
            }
            case ParamType::Int:
                layout.add (std::make_unique<juce::AudioParameterInt> (id, name, (int) p.min, (int) p.max, (int) p.def));
                break;
        }
    }
    return layout;
}

bool Halden6Processor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    return layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo()
        && layouts.getMainInputChannelSet().isDisabled();
}

void Halden6Processor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    pushPanel();
    engine.prepare ((int) std::lround (sampleRate), juce::jmax (samplesPerBlock, 32));
    panelMidi.ensureSize (256);
    setLatencySamples ((int) (0.005 * sampleRate));   // the limiter's 5 ms lookahead
}

// Copy the DAW parameters into the engine. Choice, bool and int parameters
// arrive as their index or 0/1, the same numbers the web panel uses.
void Halden6Processor::pushPanel()
{
    for (int i = 0; i < kNumParams; ++i)
        values[i] = raw[i]->load (std::memory_order_relaxed);
    engine.setPanel (values, perf);
}

void Halden6Processor::handleMidi (const juce::MidiMessage& m)
{
    if (m.isNoteOn())
        engine.noteOn (m.getNoteNumber(), m.getFloatVelocity());
    else if (m.isNoteOff())
        engine.noteOff (m.getNoteNumber());
    else if (m.isPitchWheel())
    {
        perf.pitchWheel = juce::jlimit (-1.0f, 1.0f, (float) (m.getPitchWheelValue() - 8192) / 8192.0f);
        pushPanel();
    }
    else if (m.isAllNotesOff() || m.isAllSoundOff() || m.isResetAllControllers())
    {
        if (m.isResetAllControllers()) { perf.pitchWheel = 0.0f; pushPanel(); }
        else engine.panic();
    }
}

void Halden6Processor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;

    if (auto* head = getPlayHead())
        if (auto pos = head->getPosition())
            if (auto bpm = pos->getBpm())
                perf.bpm = *bpm;
    bpmForPanel = perf.bpm;
    if (panelWheelPending.exchange (false))
        perf.pitchWheel = panelWheel.load();
    pushPanel();

    // Notes from the panel's keys join the host's MIDI
    // (try-lock: the audio thread never waits; busy now means next block)
    if (const juce::SpinLock::ScopedTryLockType lock (panelMidiLock); lock.isLocked() && ! panelMidi.isEmpty())
    {
        midi.addEvents (panelMidi, 0, -1, 0);
        panelMidi.clear();
    }

    // Render up to each MIDI event, so notes start on the exact sample
    auto* left = buffer.getWritePointer (0);
    auto* right = buffer.getWritePointer (1);
    const int numSamples = buffer.getNumSamples();
    int pos = 0;
    for (const auto meta : midi)
    {
        const int at = juce::jlimit (0, numSamples, meta.samplePosition);
        if (at > pos)
        {
            engine.render (left + pos, right + pos, at - pos);
            pos = at;
        }
        handleMidi (meta.getMessage());
    }
    if (pos < numSamples)
        engine.render (left + pos, right + pos, numSamples - pos);

    // Keep the last few thousand samples for the panel's live scope
    int w = scopeWrite.load (std::memory_order_relaxed);
    for (int i = 0; i < numSamples; ++i)
    {
        scopeRing[(size_t) w].store (0.5f * (left[i] + right[i]), std::memory_order_relaxed);
        w = (w + 1) % kScopeRing;
    }
    scopeWrite.store (w, std::memory_order_release);
}

void Halden6Processor::copyScope (float* dest, int n) const
{
    n = juce::jmin (n, kScopeRing);
    const int end = scopeWrite.load (std::memory_order_acquire);
    for (int i = 0; i < n; ++i)
        dest[i] = scopeRing[(size_t) ((end - n + i + kScopeRing) % kScopeRing)].load (std::memory_order_relaxed);
}

juce::AudioProcessorEditor* Halden6Processor::createEditor()
{
    return new Halden6Editor (*this);
}

void Halden6Processor::getStateInformation (juce::MemoryBlock& destData)
{
    auto tree = state.copyState();
    tree.setProperty ("stateVersion", kStateVersion, nullptr);
    if (auto xml = tree.createXml())
        copyXmlToBinary (*xml, destData);
}

void Halden6Processor::setStateInformation (const void* data, int sizeInBytes)
{
    if (auto xml = getXmlFromBinary (data, sizeInBytes))
        if (xml->hasTagName (state.state.getType()))
            state.replaceState (juce::ValueTree::fromXml (*xml));
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new Halden6Processor();
}
