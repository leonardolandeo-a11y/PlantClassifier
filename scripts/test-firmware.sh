#!/usr/bin/env bash
set -euo pipefail
cmp ESP32/Movement/command_gate.h ESP32/PlantClassifier/command_gate.h
cmp ESP32/Movement/control_protocol.h ESP32/PlantClassifier/control_protocol.h
binary=$(mktemp /tmp/plantclassifier-gate.XXXXXX)
trap 'rm -f "$binary"' EXIT
g++ -std=c++17 -Wall -Wextra -Werror ESP32/tests/command_gate_test.cpp -o "$binary"
"$binary"
cmp ESP32/Movement/simulation_config.h ESP32/PlantClassifier/simulation_config.h
cmp ESP32/Movement/simulated_capture.h ESP32/PlantClassifier/simulated_capture.h
# A simulation build must reject enabling the physical diagnostic endpoint.
if printf '#define SIMULATION_MODE 1\n#define ENABLE_SELFTEST_ENDPOINT 1\n#include "ESP32/Movement/simulation_config.h"\n' | g++ -I. -x c++ -fsyntax-only - >/dev/null 2>&1; then
  echo 'FAIL: simulation permits the physical diagnostic endpoint' >&2; exit 1
fi
echo 'PASS: simulation rejects physical diagnostic configuration'
