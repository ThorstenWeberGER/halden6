# Halden 6 VST3 instrument. Build from the repo root with install.cmd, or:
#   cmake -S plugin -B build -DCMAKE_BUILD_TYPE=Release
#   cmake --build build --config Release
cmake_minimum_required(VERSION 3.22)
project(Halden6 VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Stable and Dev are separate plugins with their own IDs, so both can sit in Live
set(HALDEN6_CHANNEL "Stable" CACHE STRING "Stable or Dev")
set_property(CACHE HALDEN6_CHANNEL PROPERTY STRINGS Stable Dev)
if(HALDEN6_CHANNEL STREQUAL "Dev")
  set(HALDEN6_NAME "Halden 6 Dev")
  set(HALDEN6_CODE "H6dv")
elseif(HALDEN6_CHANNEL STREQUAL "Stable")
  set(HALDEN6_NAME "Halden 6")
  set(HALDEN6_CODE "H6st")
else()
  message(FATAL_ERROR "HALDEN6_CHANNEL must be Stable or Dev")
endif()

if(NOT EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/JUCE/CMakeLists.txt")
  message(FATAL_ERROR "JUCE is missing. Run: git submodule update --init --depth 1 plugin/JUCE")
endif()
add_subdirectory(JUCE)

juce_add_plugin(Halden6
  PRODUCT_NAME "${HALDEN6_NAME}"
  COMPANY_NAME "Halden"
  BUNDLE_ID "org.halden.halden6"
  PLUGIN_MANUFACTURER_CODE Hldn        # never change: part of the plugin ID
  PLUGIN_CODE ${HALDEN6_CODE}          # never change: part of the plugin ID
  FORMATS VST3
  IS_SYNTH TRUE
  NEEDS_MIDI_INPUT TRUE
  NEEDS_MIDI_OUTPUT FALSE
  IS_MIDI_EFFECT FALSE
  EDITOR_WANTS_KEYBOARD_FOCUS FALSE
  COPY_PLUGIN_AFTER_BUILD FALSE        # install.ps1 copies it
  VST3_CATEGORIES Instrument Synth)

target_sources(Halden6 PRIVATE
  Source/PluginProcessor.cpp
  Source/Engine.cpp)

target_compile_definitions(Halden6 PUBLIC
  JUCE_WEB_BROWSER=0                   # phase 3 turns this on for the panel
  JUCE_USE_CURL=0
  JUCE_VST3_CAN_REPLACE_VST2=0
  JUCE_DISPLAY_SPLASH_SCREEN=0)

target_link_libraries(Halden6
  PRIVATE
    juce::juce_audio_processors
  PUBLIC
    juce::juce_recommended_config_flags
    juce::juce_recommended_lto_flags
    juce::juce_recommended_warning_flags)

# Optional: a console app that loads the built .vst3 like a DAW and plays it.
#   cmake -S plugin -B build -DHALDEN6_HOST_TEST=ON
#   build/Halden6HostTest_artefacts/Release/Halden6HostTest "build/Halden6_artefacts/Release/VST3/Halden 6.vst3"
option(HALDEN6_HOST_TEST "Build the plugin host test" OFF)
if(HALDEN6_HOST_TEST)
  juce_add_console_app(Halden6HostTest PRODUCT_NAME "Halden6HostTest")
  target_sources(Halden6HostTest PRIVATE tools/hosttest.cpp)
  target_compile_definitions(Halden6HostTest PRIVATE
    JUCE_PLUGINHOST_VST3=1 JUCE_WEB_BROWSER=0 JUCE_USE_CURL=0)
  target_link_libraries(Halden6HostTest PRIVATE
    juce::juce_audio_processors
    juce::juce_recommended_config_flags)
endif()
