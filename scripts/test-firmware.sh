#!/usr/bin/env bash
set -euo pipefail
cmp ESP32/Movement/command_gate.h ESP32/PlantClassifier/command_gate.h
cmp ESP32/Movement/control_protocol.h ESP32/PlantClassifier/control_protocol.h
binary=$(mktemp /tmp/plantclassifier-gate.XXXXXX)
trap 'rm -f "$binary"' EXIT
g++ -std=c++17 -Wall -Wextra -Werror ESP32/tests/command_gate_test.cpp -o "$binary"
"$binary"
