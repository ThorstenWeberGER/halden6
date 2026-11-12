// Opens the real plugin window (the web panel) and drives it both ways.
//
//   Halden6PanelTest [screenshot-dir]
//
// Links the plugin code directly, so it can look inside the web view. A
// background thread plays the role of the host's audio thread. Checks:
// the panel loads in plugin mode with Live's values, Live automation moves
// the panel, the panel changes Live's parameters (with gestures), the
// on-screen keys and the scope work, presets reach Live, and the window resizes.

#include "../Source/PluginEditor.h"
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

void pump (int ms) { juce::MessageManager::getInstance()->runDispatchLoopUntil (ms); }

// Run JavaScript in the panel and wait for its result
juce::var js (Halden6Editor& ed, const juce::String& code)
{
    juce::var result;
    bool done = false;
    ed.evaluateJavascript (code, [&] (juce::WebBrowserComponent::EvaluationResult r) {
        if (auto* v = r.getResult()) result = *v;
        else if (auto* e = r.getError()) std::cout << "  js error: " << e->message << std::endl;
        done = true;
    });
    for (int i = 0; i < 200 && ! done; ++i)
        pump (10);
    return result;
}

// The host's audio thread
struct FakeAudio : juce::Thread
{
    explicit FakeAudio (juce::AudioProcessor& p) : juce::Thread ("audio"), proc (p) {}
    void run() override
    {
        juce::AudioBuffer<float> buf (2, 512);
        while (! threadShouldExit())
        {
            buf.clear();
            juce::MidiBuffer midi;
            if (const int n = injectNote.exchange (-1); n >= 0)
                midi.addEvent (juce::MidiMessage::noteOn (1, n, (juce::uint8) 90), 0);
            proc.processBlock (buf, midi);
            peak = juce::jmax (buf.getMagnitude (0, 0, 512), buf.getMagnitude (1, 0, 512));
            wait (10);
        }
    }
    juce::AudioProcessor& proc;
    std::atomic<float> peak { 0.0f };
    std::atomic<int> injectNote { -1 };   // a note "from Live's MIDI"
};

struct Gestures : juce::AudioProcessorListener
{
    void audioProcessorParameterChanged (juce::AudioProcessor*, int, float) override {}
    void audioProcessorChanged (juce::AudioProcessor*, const ChangeDetails&) override {}
    void audioProcessorParameterChangeGestureBegin (juce::AudioProcessor*, int) override { ++begins; }
    void audioProcessorParameterChangeGestureEnd (juce::AudioProcessor*, int) override { ++ends; }
    std::atomic<int> begins { 0 }, ends { 0 };
};

float value (Halden6Processor& p, const char* id) { return p.state.getRawParameterValue (id)->load(); }
void setFromHost (Halden6Processor& p, const char* id, float plain)
{
    auto* param = p.state.getParameter (id);
    param->setValueNotifyingHost (param->convertTo0to1 (plain));
}

void screenshot (const juce::String& dir, const juce::String& name)
{
    if (dir.isEmpty()) return;
    pump (800);
    juce::ChildProcess cp;
    cp.start ("import -window root " + juce::File (dir).getChildFile (name).getFullPathName());
    cp.waitForProcessToFinish (10000);
}
} // namespace

int main (int argc, char** argv)
{
    const juce::String shots = argc > 1 ? juce::String (argv[1]) : juce::String();
    juce::ScopedJuceInitialiser_GUI gui;

    Halden6Processor proc;
    proc.setPlayConfigDetails (0, 2, 48000, 512);
    proc.prepareToPlay (48000, 512);
    setFromHost (proc, "vcfFreq", 0.3f);          // a value set before the window opens
    Gestures gestures;
    proc.addListener (&gestures);
    FakeAudio audio (proc);
    audio.startThread();

    auto* ed = dynamic_cast<Halden6Editor*> (proc.createEditor());
    juce::DocumentWindow win ("Halden 6", juce::Colours::black, 0, true);
    win.setUsingNativeTitleBar (true);
    win.setContentOwned (ed, true);
    win.setTopLeftPosition (0, 0);
    win.setVisible (true);

    std::cout << "Panel" << std::endl;
    bool loaded = false;
    for (int i = 0; i < 100 && ! loaded; ++i)
    {
        pump (100);
        loaded = (bool) js (*ed, "!!document.querySelector('.rack-row') && !!window.Synth && window.Synth.isPlugin === true");
    }
    check (loaded, "the panel loads inside the plugin, in plugin mode");
    if (! loaded)
    {
        std::cout << "  page: " << js (*ed, "document.documentElement.outerHTML.slice(0, 300)").toString() << std::endl;
        audio.stopThread (1000);
        return 1;
    }
    check (! (bool) js (*ed, "!!document.querySelector('#btn-comment')"), "no comment mode button");
    check (std::abs ((double) js (*ed, "Synth.params.vcfFreq") - 0.3) < 1e-6, "it shows Live's values from the start (VCF Freq 0.3)");
    check ((int) js (*ed, "document.querySelectorAll('.module').length") >= 10, "all sections are drawn");
    check (ed->getWidth() == 1280 && ed->getHeight() == 820, "the window opens at 1280 x 820 (" + juce::String (ed->getWidth()) + " x " + juce::String (ed->getHeight()) + ")");
    // (compared as a number: the Linux test transport mangles non-ASCII results)
    check ((int) js (*ed, "document.querySelector('#preset-prev').textContent.charCodeAt(0)") == 0x2039,
           "special characters show correctly (the preset arrow)");
    screenshot (shots, "panel-1280x820.png");

    std::cout << "Live to panel" << std::endl;
    setFromHost (proc, "vcfRes", 0.8f);
    setFromHost (proc, "dcoSub", 1.0f);
    pump (300);
    check (std::abs ((double) js (*ed, "Synth.params.vcfRes") - 0.8) < 1e-6, "automation moves the panel value (VCF Res 0.8)");
    check (js (*ed, "document.querySelector('[data-cid=vcfRes] .fader').style.getPropertyValue('--v')").toString().getDoubleValue() > 0.79,
           "and the fader is redrawn");
    check ((int) js (*ed, "Synth.params.dcoSub") == 1, "switches follow too (DCO Sub on)");

    std::cout << "Panel to Live" << std::endl;
    const int b0 = gestures.begins, e0 = gestures.ends;
    js (*ed, "Synth.beginGesture('envA'); [0.2,0.4,0.6,0.9].forEach(v => Synth.setParam('envA', v)); Synth.endGesture('envA'); true");
    pump (200);
    check (std::abs (value (proc, "envA") - 0.9f) < 1e-4f, "a drag in the panel sets Live's parameter (ENV A 0.9)");
    check (gestures.begins - b0 == 1 && gestures.ends - e0 == 1, "as one gesture, so Live records it and undoes it in one step");
    const float pulseBefore = value (proc, "dcoPulse");
    js (*ed, "document.querySelector('[data-cid=dcoPulse] button').click(); true");
    pump (200);
    check (value (proc, "dcoPulse") != pulseBefore, "clicking a toggle in the panel switches it in Live (DCO Pulse)");
    js (*ed, "document.querySelector('#preset-next').click(); true");
    pump (300);
    const auto presetName = js (*ed, "document.querySelector('#preset-label').textContent").toString();
    check (presetName.isNotEmpty() && presetName != "Your patch", "a preset from the panel library loads (" + presetName + ")");
    pump (300);
    check (! (bool) js (*ed, "document.querySelector('#preset-label').textContent.includes('*') || document.querySelector('.preset-bar').classList.contains('edited')"),
           "and is not marked as edited when its values come back from Live");
    check (std::abs (value (proc, "vcfFreq") - (float) (double) js (*ed, "Synth.params.vcfFreq")) < 1e-4f, "and its values reach Live (VCF Freq)");

    check (proc.getCurrentProgram() == 0 && proc.presetNumber() == 1, "Live's preset menu follows the panel (preset 1)");
    proc.setCurrentProgram (82);   // 083 in Live's menu
    pump (400);
    check ((int) js (*ed, "document.querySelector('#preset-num').textContent.trim() === '083' ? 1 : 0") == 1
             && ! (bool) js (*ed, "document.querySelector('#preset-label').textContent.includes('*')"),
           "a preset chosen in Live's menu shows in the panel, not marked as edited");
    check (std::abs (value (proc, "vcfFreq") - (float) (double) js (*ed, "Synth.params.vcfFreq")) < 1e-4f, "and the panel shows its values");

    std::cout << "Keys and scope" << std::endl;
    audio.peak = 0.0f;
    js (*ed, "Synth.noteOn(60, 0.9); Synth.noteOn(64, 0.9); true");
    pump (500);
    check (audio.peak > 0.01f, "the on-screen keys play the synth (peak " + juce::String (audio.peak.load(), 3) + ")");
    const double scopePeak = (double) js (*ed, "(() => { const b = new Float32Array(2048); Synth.analyser().getFloatTimeDomainData(b); return Math.max(...b.map(Math.abs)); })()");
    check (scopePeak > 0.01, "the live scope shows the output (peak " + juce::String (scopePeak, 3) + ")");
    js (*ed, "Synth.setParam('pitchWheel', 1); true");
    pump (200);
    js (*ed, "Synth.setParam('pitchWheel', 0); Synth.noteOff(60); Synth.noteOff(64); true");
    pump (100);

    std::cout << "Arpeggiator" << std::endl;
    // the web view remembers the bar's state between runs: open it only if closed
    js (*ed, "if (!document.querySelector('#arp-panel').classList.contains('open')) document.querySelector('#arp-toggle').click(); true");
    pump (300);
    check ((bool) js (*ed, "document.querySelector('#arp-panel').classList.contains('open')"), "the arpeggiator bar opens");
    js (*ed, "const s = document.querySelector('#arp-preset'); s.value = '0'; s.dispatchEvent(new Event('change')); true");
    pump (300);
    const auto patternJson = proc.getArpPatternJson();
    check (patternJson.contains ("\"note\":48") && (int) value (proc, "arpMode") == 1,
           "a factory pattern from the panel reaches the plugin (Italo Octaves, Pattern mode)");
    js (*ed, "document.querySelector('[data-cid=arpOn] button').click(); true");
    pump (200);
    check (value (proc, "arpOn") > 0.5f, "the panel's ARP On switch turns on the plugin's arp");
    audio.peak = 0.0f;
    js (*ed, "Synth.noteOn(60, 0.8); true");
    pump (700);
    check (audio.peak > 0.01f, "holding a key plays the pattern in the plugin");
    check ((int) js (*ed, "document.querySelectorAll('.pat-grid .play').length") > 0, "the panel shows the plugin's playhead in the grid");
    js (*ed, "Synth.noteOff(60); true");
    pump (300);
    check ((int) js (*ed, "document.querySelectorAll('.pat-grid .play').length") == 0, "the playhead goes when the keys are released");

    js (*ed, "document.querySelector('.pat-rec').click(); true");
    pump (100);
    audio.injectNote = 62;
    pump (400);
    audio.injectNote = 65;
    pump (400);
    js (*ed, "document.querySelector('.pat-rec').click(); true");
    pump (300);
    const auto recorded = juce::JSON::parse (proc.getArpPatternJson());
    check ((int) recorded["length"] == 2 && (int) recorded["steps"][0]["note"] == 62 && (int) recorded["steps"][1]["note"] == 65,
           "step recording takes notes played in Live (D4, F4)");
    {
        juce::MemoryBlock saved;
        proc.getStateInformation (saved);
        Halden6Processor other;
        other.setStateInformation (saved.getData(), (int) saved.getSize());
        check (other.getArpPatternJson() == proc.getArpPatternJson(), "the pattern is saved with the Live set");
    }
    js (*ed, "document.querySelector('[data-cid=arpOn] button').click(); true");
    pump (200);

    std::cout << "Resizing" << std::endl;
    win.setSize (900, 600);
    pump (800);
    const int innerW = (int) js (*ed, "window.innerWidth");
    check (std::abs (innerW - ed->getWidth()) <= 2, "the panel follows the window size (" + juce::String (innerW) + " px wide)");
    check ((int) proc.state.state.getProperty ("uiWidth") == ed->getWidth(), "the size is saved with the Live set");
    check (! (bool) js (*ed, "document.documentElement.scrollWidth > window.innerWidth + 1"), "no sideways scrolling at the smaller size");
    screenshot (shots, "panel-900x600.png");
    win.setSize (1920, 1080);
    pump (800);
    screenshot (shots, "panel-1920x1080.png");

    std::cout << "Closing" << std::endl;
    win.clearContentComponent();
    pump (300);
    audio.peak = 0.0f;
    juce::MidiBuffer m;
    m.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 0);
    juce::AudioBuffer<float> buf (2, 512);
    audio.stopThread (1000);
    proc.processBlock (buf, m);
    for (int i = 0; i < 20; ++i) { buf.clear(); juce::MidiBuffer none; proc.processBlock (buf, none); }
    check (buf.getMagnitude (0, 0, 512) > 0.01f, "the synth keeps playing with the window closed");
    proc.removeListener (&gestures);

    std::cout << (failures == 0 ? "All panel checks passed" : juce::String (failures) + " panel checks failed") << std::endl;
    return failures == 0 ? 0 : 1;
}
