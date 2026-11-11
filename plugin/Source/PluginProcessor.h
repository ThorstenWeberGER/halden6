#pragma once

#include "Engine.h"
#include <juce_audio_processors/juce_audio_processors.h>
#include <array>

class Halden6Processor final : public juce::AudioProcessor
{
public:
    Halden6Processor();

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported (const BusesLayout& layouts) const override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    using AudioProcessor::processBlock;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return JucePlugin_Name; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 10.0; }   // longest release

    // The 100 factory presets, in Live's preset menu
    int getNumPrograms() override;
    int getCurrentProgram() override;
    void setCurrentProgram (int index) override;
    const juce::String getProgramName (int index) override;
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    juce::AudioProcessorValueTreeState state;

    // For the panel (message thread)
    void addPanelMidi (const juce::MidiMessage& m)
    {
        const juce::SpinLock::ScopedLockType lock (panelMidiLock);
        panelMidi.addEvent (m, 0);
    }
    void setPanelPitchWheel (float v) { panelWheel = v; panelWheelPending = true; }
    void copyScope (float* dest, int n) const;
    double hostBpm() const { return bpmForPanel.load(); }

    // The preset the panel shows: its number (0 = none) and whether it was
    // edited since loading. Saved with the Live set.
    int presetNumber() const { return presetNum.load(); }
    bool presetIsEdited() const { return presetEdited.load(); }
    void setPresetFromPanel (int num, bool edited);

private:
    static juce::AudioProcessorValueTreeState::ParameterLayout createLayout();
    void handleMidi (const juce::MidiMessage& m);
    void pushPanel();

    halden6::Engine engine;
    std::atomic<float>* raw[halden6::kNumParams] {};
    float values[halden6::kNumParams] {};
    halden6::Performance perf;

    juce::MidiBuffer panelMidi;             // notes from the on-screen keys
    juce::SpinLock panelMidiLock;
    std::atomic<float> panelWheel { 0.0f };
    std::atomic<bool> panelWheelPending { false };
    std::atomic<double> bpmForPanel { 120.0 };
    static constexpr int kScopeRing = 4096;
    std::array<std::atomic<float>, kScopeRing> scopeRing {};
    std::atomic<int> scopeWrite { 0 };
    std::atomic<int> presetNum { 0 };
    std::atomic<bool> presetEdited { false };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (Halden6Processor)
};
