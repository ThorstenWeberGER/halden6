// The plugin window: the Halden 6 web panel in a web view (WebView2 on
// Windows), resizable, with the panel's own scaling doing the layout.
#pragma once

#include "PluginProcessor.h"
#include <juce_gui_extra/juce_gui_extra.h>

class Halden6Editor final : public juce::AudioProcessorEditor,
                            private juce::Timer,
                            private juce::AudioProcessorValueTreeState::Listener
{
public:
    explicit Halden6Editor (Halden6Processor&);
    ~Halden6Editor() override;

    void resized() override;

    // For plugin/tools/paneltest.cpp
    void evaluateJavascript (const juce::String& js, juce::WebBrowserComponent::EvaluationCallback cb) { web.evaluateJavascript (js, std::move (cb)); }

private:
    void timerCallback() override;
    void parameterChanged (const juce::String& id, float newValue) override;
    void handleMessage (const juce::var& msg);
    juce::var allValues() const;
    void sendValues (const juce::var& values);

    static std::optional<juce::WebBrowserComponent::Resource> serve (const juce::String& path);
    juce::WebBrowserComponent::Options options();

    Halden6Processor& proc;
    juce::WebBrowserComponent web;
    std::array<std::atomic<bool>, halden6::kNumParams> dirty {};
    std::vector<float> scope;
    double lastBpm = 0.0;
    bool sizeRestored = false;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (Halden6Editor)
};
