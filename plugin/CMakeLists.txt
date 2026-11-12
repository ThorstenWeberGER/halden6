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

# HALDEN6_JUCE_DIR points at another JUCE checkout, for experiments only
set(HALDEN6_JUCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/JUCE" CACHE PATH "JUCE source folder")
if(NOT EXISTS "${HALDEN6_JUCE_DIR}/CMakeLists.txt")
  message(FATAL_ERROR "JUCE is missing. Run: git submodule update --init --depth 1 plugin/JUCE")
endif()
add_subdirectory("${HALDEN6_JUCE_DIR}" JUCE)

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
  EDITOR_WANTS_KEYBOARD_FOCUS TRUE     # the computer keyboard plays notes, as in the browser
  NEEDS_WEB_BROWSER TRUE               # Linux: WebKitGTK
  NEEDS_WEBVIEW2 TRUE                  # Windows: WebView2
  COPY_PLUGIN_AFTER_BUILD FALSE        # install.ps1 copies it
  VST3_CATEGORIES Instrument Synth)

target_sources(Halden6 PRIVATE
  Source/PluginProcessor.cpp
  Source/PluginEditor.cpp
  Source/Engine.cpp
  Source/Arp.cpp)

# The web panel, packed into the plugin. The same files as the web version,
# except synth.js (the browser sound engine), which web/bridge.js replaces.
set(R "${CMAKE_CURRENT_SOURCE_DIR}/..")
juce_add_binary_data(Halden6WebUI
  HEADER_NAME Halden6WebUI.h
  NAMESPACE Halden6WebUI
  SOURCES
    ${R}/index.html ${R}/styles.css ${R}/panel.js ${R}/mapping.js ${R}/presets.js
    ${R}/arp-patterns.js ${R}/arp.js ${R}/viz.js ${R}/backdrop.js ${R}/ui.js ${R}/midi.js
    ${R}/fonts/fonts.css ${R}/fonts/inter-variable.woff2 ${R}/fonts/jetbrains-mono-variable.woff2
    ${R}/fonts/barlow-condensed-500.woff2 ${R}/fonts/barlow-condensed-600.woff2 ${R}/fonts/barlow-condensed-700.woff2
    ${CMAKE_CURRENT_SOURCE_DIR}/web/bridge.js)
set_target_properties(Halden6WebUI PROPERTIES POSITION_INDEPENDENT_CODE ON)

target_compile_definitions(Halden6 PUBLIC
  JUCE_WEB_BROWSER=1
  JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1   # no WebView2Loader.dll to ship next to the plugin
  JUCE_USE_CURL=0
  JUCE_VST3_CAN_REPLACE_VST2=0)

target_link_libraries(Halden6
  PRIVATE
    Halden6WebUI
    juce::juce_audio_processors
    juce::juce_gui_extra
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

# Optional: opens the plugin window and drives the web panel both ways.
# Linux needs a display (Xvfb works).
if(HALDEN6_HOST_TEST)
  juce_add_console_app(Halden6PanelTest PRODUCT_NAME "Halden6PanelTest" NEEDS_WEB_BROWSER TRUE)
  # Compiles the plugin's own sources into the app, so the test can reach the panel
  target_sources(Halden6PanelTest PRIVATE tools/paneltest.cpp
    Source/PluginProcessor.cpp Source/PluginEditor.cpp Source/Engine.cpp Source/Arp.cpp)
  target_compile_definitions(Halden6PanelTest PRIVATE
    JucePlugin_Name="Halden 6" JUCE_WEB_BROWSER=1 JUCE_USE_CURL=0 JUCE_MODAL_LOOPS_PERMITTED=1)
  target_link_libraries(Halden6PanelTest PRIVATE Halden6WebUI
    juce::juce_audio_processors juce::juce_gui_extra juce::juce_recommended_config_flags)
endif()
