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

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
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

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (Halden6Processor)
};
