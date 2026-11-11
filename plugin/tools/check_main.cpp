// Command-line front end to the plugin engine, used by check.mjs.
//
//   halden6_check map              stdin: one panel per line (kNumParams values,
//                                  then pitchWheel, bpm); stdout: the Faust
//                                  control values, one line per panel
//   halden6_check render SR FRAMES OUT.raw
//                                  stdin: first line the panel as above, then
//                                  "frame on|off note velocity" lines in frame
//                                  order; writes FRAMES left then FRAMES right
//                                  samples as float32
//   halden6_check arp SR CHUNK      stdin: an arp script, one command per line:
//                                  settings ON MODE LATCH RATE SWING ORDER OCTAVES GATE
//                                  tempo BPM | play PPQ | stop | down NOTE VEL | up NOTE
//                                  advance SAMPLES (split into CHUNK-sized calls)
//                                  stdout: "TIME on|off NOTE VEL" per event, TIME in
//                                  samples since the start
#include "../Source/Engine.h"
#include "../Source/Arp.h"
#include "../Source/generated/ArpPatterns.h"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

using namespace halden6;

static bool readPanel (std::istream& in, float* params, Performance& perf)
{
    std::string line;
    if (! std::getline (in, line))
        return false;
    std::istringstream s (line);
    for (int i = 0; i < kNumParams; ++i)
        s >> params[i];
    s >> perf.pitchWheel >> perf.bpm;
    return (bool) s;
}

int main (int argc, char** argv)
{
    const std::string mode = argc > 1 ? argv[1] : "";
    float params[kNumParams] {};
    Performance perf;

    if (mode == "map")
    {
        std::printf ("%s", kDspNames[0]);
        for (int k = 1; k < DspValues::kCount; ++k)
            std::printf (" %s", kDspNames[k]);
        std::printf ("\n");
        while (readPanel (std::cin, params, perf))
        {
            const auto d = dspValues (params, perf);
            for (int k = 0; k < DspValues::kCount; ++k)
                std::printf (k ? " %.17g" : "%.17g", d.v[k]);
            std::printf ("\n");
        }
        return 0;
    }

    if (mode == "render" && argc == 5)
    {
        const int sr = std::atoi (argv[2]);
        const int frames = std::atoi (argv[3]);
        if (! readPanel (std::cin, params, perf))
            return 2;

        struct Event { int frame; bool on; int note; float vel; };
        std::vector<Event> events;
        std::string onOff;
        Event e {};
        while (std::cin >> e.frame >> onOff >> e.note >> e.vel)
        {
            e.on = onOff == "on";
            events.push_back (e);
        }

        Engine engine;
        engine.prepare (sr, 128);
        engine.setPanel (params, perf);
        std::vector<float> left ((size_t) frames), right ((size_t) frames);
        int pos = 0;
        size_t next = 0;
        while (pos < frames)
        {
            while (next < events.size() && events[next].frame <= pos)
            {
                const auto& ev = events[next++];
                if (ev.on) engine.noteOn (ev.note, ev.vel);
                else engine.noteOff (ev.note);
            }
            int end = frames;
            if (next < events.size())
                end = std::min (end, events[next].frame);
            end = std::min (end, pos + (std::getenv ("H6_CHUNK") ? std::atoi (std::getenv ("H6_CHUNK")) : 128));
            engine.render (left.data() + pos, right.data() + pos, end - pos);
            pos = end;
        }

        FILE* f = std::fopen (argv[4], "wb");
        if (f == nullptr)
            return 3;
        std::fwrite (left.data(), sizeof (float), left.size(), f);
        std::fwrite (right.data(), sizeof (float), right.size(), f);
        std::fclose (f);
        return 0;
    }

    if (mode == "arp" && argc == 4)
    {
        const double sr = std::atof (argv[2]);
        const int chunk = std::max (1, std::atoi (argv[3]));
        Arp arp;
        arp.prepare (sr);
        arp.setPattern (defaultArpPattern());
        ArpTime t;
        int64_t clock = 0;
        std::vector<ArpEvent> events;
        std::string cmd;
        while (std::cin >> cmd)
        {
            if (cmd == "settings")
            {
                ArpSettings s;
                int on, latch;
                std::cin >> on >> s.mode >> latch >> s.rate >> s.swing >> s.order >> s.octaves >> s.gate;
                s.on = on != 0; s.latch = latch != 0;
                arp.setSettings (s);
            }
            else if (cmd == "tempo") std::cin >> t.bpm;
            else if (cmd == "play") { std::cin >> t.ppq; t.playing = true; }
            else if (cmd == "stop") t.playing = false;
            else if (cmd == "down") { int n; float v; std::cin >> n >> v; arp.keyDown (n, v); }
            else if (cmd == "up") { int n; std::cin >> n; arp.keyUp (n); }
            else if (cmd == "advance")
            {
                int n;
                std::cin >> n;
                while (n > 0)
                {
                    const int m = std::min (n, chunk);
                    arp.advance (m, t, events);
                    for (const auto& e : events)
                        std::printf ("%lld %s %d %.4f\n", (long long) (clock + e.offset), e.on ? "on" : "off", e.note, e.vel);
                    clock += m;
                    n -= m;
                    if (t.playing)
                        t.ppq += m * t.bpm / (60.0 * sr);
                }
            }
        }
        return 0;
    }

    std::fprintf (stderr, "usage: halden6_check map | render SR FRAMES OUT.raw | arp SR CHUNK\n");
    return 1;
}
