# The check tool only: the plugin engine without JUCE. Built by check.mjs.
cmake_minimum_required(VERSION 3.22)
project(halden6_check LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
add_executable(halden6_check check_main.cpp ../Source/Engine.cpp ../Source/Arp.cpp)
