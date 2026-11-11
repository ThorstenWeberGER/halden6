// The small part of the Faust architecture the generated classes need: the
// dsp base class, a UI that hands out the address of each control, and Meta.
// Include this before generated/Halden6Voice.h and generated/Halden6Effect.h.
#pragma once

#ifndef FAUSTFLOAT
 #define FAUSTFLOAT float
#endif

#include <string>
#include <utility>
#include <vector>

struct Meta
{
    virtual ~Meta() = default;
    virtual void declare (const char*, const char*) {}
};

struct UI
{
    virtual ~UI() = default;
    virtual void openVerticalBox (const char*) {}
    virtual void closeBox() {}
    virtual void addButton (const char* label, FAUSTFLOAT* zone) = 0;
    virtual void addHorizontalSlider (const char* label, FAUSTFLOAT* zone,
                                      FAUSTFLOAT init, FAUSTFLOAT min, FAUSTFLOAT max, FAUSTFLOAT step) = 0;
};

struct dsp
{
    virtual ~dsp() = default;
    virtual int getNumInputs() = 0;
    virtual int getNumOutputs() = 0;
    virtual void buildUserInterface (UI*) = 0;
    virtual int getSampleRate() = 0;
    virtual void init (int sampleRate) = 0;
    virtual void instanceInit (int sampleRate) = 0;
    virtual void instanceConstants (int sampleRate) = 0;
    virtual void instanceResetUserInterface() = 0;
    virtual void instanceClear() = 0;
    virtual dsp* clone() = 0;
    virtual void compute (int count, FAUSTFLOAT** inputs, FAUSTFLOAT** outputs) = 0;
};

// Collects label -> control address
struct ZoneMap : UI
{
    std::vector<std::pair<std::string, FAUSTFLOAT*>> zones;

    void addButton (const char* label, FAUSTFLOAT* zone) override { zones.emplace_back (label, zone); }
    void addHorizontalSlider (const char* label, FAUSTFLOAT* zone, FAUSTFLOAT, FAUSTFLOAT, FAUSTFLOAT, FAUSTFLOAT) override
    {
        zones.emplace_back (label, zone);
    }

    FAUSTFLOAT* find (const std::string& label) const
    {
        for (auto& z : zones)
            if (z.first == label)
                return z.second;
        return nullptr;
    }
};
