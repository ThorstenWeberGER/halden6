#include "PluginEditor.h"
#include "Halden6WebUI.h"

using namespace halden6;

namespace
{
    constexpr int kDefaultWidth = 1280, kDefaultHeight = 820;
    constexpr int kScopeSize = 2048;   // what viz.js reads from its analyser

    const char* mimeType (const juce::String& file)
    {
        if (file.endsWith (".html")) return "text/html; charset=utf-8";
        if (file.endsWith (".css")) return "text/css; charset=utf-8";
        if (file.endsWith (".js")) return "text/javascript; charset=utf-8";
        if (file.endsWith (".woff2")) return "font/woff2";
        if (file.endsWith (".png")) return "image/png";
        if (file.endsWith (".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    std::vector<std::byte> bytes (const char* data, int size)
    {
        std::vector<std::byte> out ((size_t) size);
        std::memcpy (out.data(), data, (size_t) size);
        return out;
    }

    // The panel files are packed into the plugin by CMake (Halden6WebUI), stored
    // under their file names: "fonts/inter-variable.woff2" is "inter-variable.woff2"
    const char* findFile (const juce::String& fileName, int& size)
    {
        for (int i = 0; i < Halden6WebUI::namedResourceListSize; ++i)
            if (fileName == Halden6WebUI::originalFilenames[i])
                return Halden6WebUI::getNamedResource (Halden6WebUI::namedResourceList[i], size);
        return nullptr;
    }
}

std::optional<juce::WebBrowserComponent::Resource> Halden6Editor::serve (const juce::String& path)
{
    const auto file = path == "/" ? juce::String ("index.html") : path.fromLastOccurrenceOf ("/", false, false).upToFirstOccurrenceOf ("?", false, false);
    int size = 0;
    const char* data = findFile (file, size);
    if (data == nullptr)
        return std::nullopt;

    if (file == "index.html")
    {
        // The same page as the web version, with the browser sound engine
        // swapped for the bridge to the plugin
        auto html = juce::String::fromUTF8 (data, size);
        const auto before = html;
        html = html.replace ("<script src=\"vendor/faustwasm.js\"></script>", "")
                   .replace ("<script src=\"dsp/halden6-dsp.js\"></script>", "")
                   .replace ("<script src=\"synth.js\"></script>", "<script src=\"bridge.js\"></script>");
        if (! html.contains ("bridge.js") || html.contains ("faustwasm"))
            html = "<html><body style='font-family:sans-serif;padding:2em'>Halden 6: index.html has changed and the plugin "
                   "cannot load its panel. Update PluginEditor.cpp.</body></html>";
        // A UTF-8 byte order mark first: it decides the encoding in every web
        // engine, also where the content type does not get through (WebKitGTK)
        const auto raw = juce::String (juce::CharPointer_UTF8 ("\xef\xbb\xbf")) + html;
        const auto encoded = raw.toUTF8();
        return juce::WebBrowserComponent::Resource { bytes (encoded.getAddress(), (int) encoded.sizeInBytes() - 1), "text/html; charset=utf-8" };
    }
    return juce::WebBrowserComponent::Resource { bytes (data, size), mimeType (file) };
}

juce::WebBrowserComponent::Options Halden6Editor::options()
{
    using Options = juce::WebBrowserComponent::Options;
    // WebView2 keeps its profile here. The default, next to Live's program
    // files, is not writable and makes WebView2 fail.
    const auto profile = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
                             .getChildFile ("Halden6").getChildFile ("WebView2");
    return Options {}
        .withBackend (Options::Backend::webview2)
        .withWinWebView2Options (Options::WinWebView2 {}.withUserDataFolder (profile).withStatusBarDisabled())
        .withNativeIntegrationEnabled()
        .withKeepPageLoadedWhenBrowserIsHidden()
        .withResourceProvider ([] (const juce::String& path) { return serve (path); })
        .withInitialisationData ("params", allValues())
        .withEventListener ("halden6", [this] (const juce::var& msg) { handleMessage (msg); });
}

Halden6Editor::Halden6Editor (Halden6Processor& p)
    : AudioProcessorEditor (p), proc (p), web (options())
{
    addAndMakeVisible (web);
    for (const auto& info : kParams)
        proc.state.addParameterListener (info.id, this);

    // Read the saved size first: setting up resizing already calls resized()
    const auto& tree = proc.state.state;
    const int w = tree.getProperty ("uiWidth", kDefaultWidth), h = tree.getProperty ("uiHeight", kDefaultHeight);
    setResizable (true, true);
    setResizeLimits (640, 420, 5120, 3200);
    setSize (w, h);
    sizeRestored = true;

    web.goToURL (juce::WebBrowserComponent::getResourceProviderRoot());
    scope.resize (kScopeSize);
    startTimerHz (30);
}

Halden6Editor::~Halden6Editor()
{
    stopTimer();
    for (const auto& info : kParams)
        proc.state.removeParameterListener (info.id, this);
}

void Halden6Editor::resized()
{
    web.setBounds (getLocalBounds());
    if (! sizeRestored)
        return;
    // Remember the size in the Live set
    proc.state.state.setProperty ("uiWidth", getWidth(), nullptr);
    proc.state.state.setProperty ("uiHeight", getHeight(), nullptr);
}

juce::var Halden6Editor::allValues() const
{
    auto* obj = new juce::DynamicObject();
    for (const auto& info : kParams)
        obj->setProperty (info.id, (double) proc.state.getRawParameterValue (info.id)->load());
    return juce::var (obj);
}

void Halden6Editor::sendValues (const juce::var& values)
{
    web.emitEventIfBrowserIsVisible ("params", values);
}

// Called on any thread (the audio thread during automation): only mark it
void Halden6Editor::parameterChanged (const juce::String& id, float)
{
    for (int i = 0; i < kNumParams; ++i)
        if (id == kParams[i].id)
            dirty[(size_t) i] = true;
}

void Halden6Editor::timerCallback()
{
    // Parameter changes from Live, about 30 times per second
    juce::DynamicObject::Ptr changed;
    for (int i = 0; i < kNumParams; ++i)
    {
        if (! dirty[(size_t) i].exchange (false))
            continue;
        if (changed == nullptr)
            changed = new juce::DynamicObject();
        changed->setProperty (kParams[i].id, (double) proc.state.getRawParameterValue (kParams[i].id)->load());
    }
    if (changed != nullptr)
        sendValues (juce::var (changed.get()));

    // The live scope
    proc.copyScope (scope.data(), kScopeSize);
    juce::Array<juce::var> data;
    data.ensureStorageAllocated (kScopeSize);
    for (float s : scope)
        data.add (std::round (s * 10000.0f) / 10000.0f);
    auto* sc = new juce::DynamicObject();
    sc->setProperty ("data", data);
    web.emitEventIfBrowserIsVisible ("scope", juce::var (sc));

    // Live's tempo, for the LFO graph when it is tempo synced
    const double bpm = proc.hostBpm();
    if (! juce::approximatelyEqual (bpm, lastBpm))
    {
        lastBpm = bpm;
        auto* host = new juce::DynamicObject();
        host->setProperty ("bpm", bpm);
        web.emitEventIfBrowserIsVisible ("host", juce::var (host));
    }
}

void Halden6Editor::handleMessage (const juce::var& msg)
{
    const auto type = msg["type"].toString();

    if (type == "set" || type == "gesture")
    {
        auto* param = proc.state.getParameter (msg["id"].toString());
        if (param == nullptr)
            return;
        if (type == "gesture")
        {
            if ((bool) msg["on"]) param->beginChangeGesture();
            else param->endChangeGesture();
            return;
        }
        // A change outside a drag (a click, the mouse wheel, a preset) is its own gesture
        const bool own = ! (bool) msg["inGesture"];
        if (own) param->beginChangeGesture();
        param->setValueNotifyingHost (param->convertTo0to1 ((float) (double) msg["value"]));
        if (own) param->endChangeGesture();
    }
    else if (type == "note")
    {
        const int note = juce::jlimit (0, 127, (int) msg["note"]);
        proc.addPanelMidi ((bool) msg["on"]
            ? juce::MidiMessage::noteOn (1, note, juce::jlimit (0.01f, 1.0f, (float) (double) msg["vel"]))
            : juce::MidiMessage::noteOff (1, note));
    }
    else if (type == "wheel")
    {
        proc.setPanelPitchWheel ((float) (double) msg["value"]);
    }
    else if (type == "panic")
    {
        proc.addPanelMidi (juce::MidiMessage::allNotesOff (1));
    }
    else if (type == "ready")
    {
        // Values may have changed between creating the page and loading it
        sendValues (allValues());
        lastBpm = 0.0;
    }
}
