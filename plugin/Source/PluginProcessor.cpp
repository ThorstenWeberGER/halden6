#include "PluginProcessor.h"
#include "PluginEditor.h"
#include "generated/Presets.h"
#include "generated/ArpPatterns.h"

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
    arp.setPattern (defaultArpPattern());
    arpEvents.reserve (512);
    hostNotes.reserve (64);
}

// ---------------------------------------------------------------- arpeggiator

namespace
{
    // The panel's pattern { length, steps: [{ on, note, vel, gate, tie } x 16] }
    std::optional<ArpPattern> parsePattern (const juce::String& json)
    {
        const auto v = juce::JSON::parse (json);
        const auto* steps = v["steps"].getArray();
        if (steps == nullptr || steps->size() != 16)
            return std::nullopt;
        ArpPattern p;
        p.length = juce::jlimit (1, 16, (int) v["length"]);
        for (int i = 0; i < 16; ++i)
        {
            const auto& s = steps->getReference (i);
            p.steps[(size_t) i] = { (bool) s["on"], juce::jlimit (0, 127, (int) s["note"]),
                                    juce::jlimit (0.0f, 1.0f, (float) (double) s["vel"]),
                                    juce::jlimit (0.0f, 1.0f, (float) (double) s["gate"]), (bool) s["tie"] };
        }
        return p;
    }
}

void Halden6Processor::setArpPatternJson (const juce::String& json)
{
    const auto p = parsePattern (json);
    if (! p.has_value())
        return;
    {
        const juce::ScopedLock l (arpJsonLock);
        arpPatternJson = json;
    }
    const juce::SpinLock::ScopedLockType l (arpPatternLock);
    pendingPattern = *p;
    patternPending = true;
}

void Halden6Processor::takeHostNotes (std::vector<std::pair<int, float>>& out)
{
    out.clear();
    const juce::SpinLock::ScopedLockType l (hostNotesLock);
    out.swap (hostNotes);
    hostNotes.reserve (64);
}

ArpSettings Halden6Processor::arpSettings() const
{
    ArpSettings s;
    s.on = values[P_arpOn] > 0.5f;
    s.mode = (int) std::lround (values[P_arpMode]);
    s.latch = values[P_arpLatch] > 0.5f;
    s.rate = (int) std::lround (values[P_arpRate]);
    s.swing = values[P_arpSwing];
    s.order = (int) std::lround (values[P_arpOrder]);
    s.octaves = (int) std::lround (values[P_arpOctaves]);
    s.gate = values[P_arpGate];
    return s;
}

// Render from pos to target, playing the arpeggiator's notes on their sample
void Halden6Processor::renderUpTo (float* left, float* right, int& pos, int target)
{
    if (target <= pos)
        return;
    ArpTime t = blockTime;
    t.ppq = blockTime.ppq + pos / samplesPerBeat;
    arp.advance (target - pos, t, arpEvents);
    int at = pos;
    for (const auto& e : arpEvents)
    {
        const int when = pos + e.offset;
        if (when > at)
        {
            engine.render (left + at, right + at, when - at);
            at = when;
        }
        if (e.on) engine.triggerOn (e.note, e.vel);
        else engine.triggerOff (e.note);
    }
    if (at < target)
        engine.render (left + at, right + at, target - at);
    pos = target;
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
    arp.prepare (sampleRate);
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
    // Keys go to the arpeggiator first; it decides whether they sound directly
    if (m.isNoteOn())
    {
        if (! arp.keyDown (m.getNoteNumber(), m.getFloatVelocity()))
            engine.noteOn (m.getNoteNumber(), m.getFloatVelocity());
    }
    else if (m.isNoteOff())
    {
        if (! arp.keyUp (m.getNoteNumber()))
            engine.noteOff (m.getNoteNumber());
    }
    else if (m.isPitchWheel())
    {
        perf.pitchWheel = juce::jlimit (-1.0f, 1.0f, (float) (m.getPitchWheelValue() - 8192) / 8192.0f);
        pushPanel();
    }
    else if (m.isAllNotesOff() || m.isAllSoundOff() || m.isResetAllControllers())
    {
        if (m.isResetAllControllers()) { perf.pitchWheel = 0.0f; pushPanel(); }
        else { arp.stopAll(); engine.panic(); }
    }
}

void Halden6Processor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;

    blockTime.playing = false;
    if (auto* head = getPlayHead())
        if (auto pos = head->getPosition())
        {
            if (auto bpm = pos->getBpm())
                perf.bpm = *bpm;
            if (auto ppq = pos->getPpqPosition(); ppq.hasValue() && pos->getIsPlaying())
            {
                blockTime.playing = true;
                blockTime.ppq = *ppq;
            }
        }
    bpmForPanel = perf.bpm;
    blockTime.bpm = perf.bpm;
    samplesPerBeat = getSampleRate() * 60.0 / juce::jlimit (20.0, 999.0, perf.bpm);
    if (panelWheelPending.exchange (false))
        perf.pitchWheel = panelWheel.load();
    pushPanel();
    arp.setSettings (arpSettings());
    if (const juce::SpinLock::ScopedTryLockType lock (arpPatternLock); lock.isLocked() && patternPending)
    {
        arp.setPattern (pendingPattern);
        patternPending = false;
    }

    // The host's notes, for step recording in the panel
    if (const juce::SpinLock::ScopedTryLockType lock (hostNotesLock); lock.isLocked())
        for (const auto meta : midi)
            if (meta.getMessage().isNoteOn() && hostNotes.size() < 64)
                hostNotes.emplace_back (meta.getMessage().getNoteNumber(), meta.getMessage().getFloatVelocity());

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
        renderUpTo (left, right, pos, juce::jlimit (0, numSamples, meta.samplePosition));
        handleMidi (meta.getMessage());
    }
    renderUpTo (left, right, pos, numSamples);
    arpPlayheadStep = arp.playhead();

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

// ---------------------------------------------------------------- presets

int Halden6Processor::getNumPrograms() { return kNumPresets; }

int Halden6Processor::getCurrentProgram() { return juce::jmax (0, presetNum.load() - 1); }

const juce::String Halden6Processor::getProgramName (int index)
{
    if (! juce::isPositiveAndBelow (index, kNumPresets))
        return {};
    const auto& p = kPresets[index];
    return juce::String (p.num).paddedLeft ('0', 3) + " " + juce::String::fromUTF8 (p.name);
}

// Loading a preset changes the sound only, as in the panel: arpeggiator,
// tempo and volume stay as they are
void Halden6Processor::setCurrentProgram (int index)
{
    if (! juce::isPositiveAndBelow (index, kNumPresets))
        return;
    const auto& p = kPresets[index];
    for (int i = 0; i < p.numValues; ++i)
    {
        auto* param = state.getParameter (kParams[p.values[i].param].id);
        param->setValueNotifyingHost (param->convertTo0to1 (p.values[i].value));
    }
    presetNum = p.num;
    presetEdited = false;
}

void Halden6Processor::setPresetFromPanel (int num, bool edited)
{
    if (num == presetNum.load() && edited == presetEdited.load())
        return;
    const bool programChanged = num != presetNum.load();
    presetNum = juce::jlimit (0, kNumPresets, num);
    presetEdited = edited;
    if (programChanged)
        updateHostDisplay (ChangeDetails().withProgramChanged (true));
}

void Halden6Processor::getStateInformation (juce::MemoryBlock& destData)
{
    auto tree = state.copyState();
    tree.setProperty ("stateVersion", kStateVersion, nullptr);
    tree.setProperty ("preset", presetNum.load(), nullptr);
    tree.setProperty ("presetEdited", presetEdited.load(), nullptr);
    tree.setProperty ("arpPattern", getArpPatternJson(), nullptr);
    tree.setProperty ("arpSlots", getArpSlotsJson(), nullptr);
    if (auto xml = tree.createXml())
        copyXmlToBinary (*xml, destData);
}

void Halden6Processor::setStateInformation (const void* data, int sizeInBytes)
{
    if (auto xml = getXmlFromBinary (data, sizeInBytes))
        if (xml->hasTagName (state.state.getType()))
        {
            const auto tree = juce::ValueTree::fromXml (*xml);
            presetNum = juce::jlimit (0, kNumPresets, (int) tree.getProperty ("preset", 0));
            presetEdited = (bool) tree.getProperty ("presetEdited", false);
            setArpPatternJson (tree.getProperty ("arpPattern", "").toString());
            setArpSlotsJson (tree.getProperty ("arpSlots", "").toString());
            state.replaceState (tree);
        }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new Halden6Processor();
}
