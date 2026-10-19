#!/usr/bin/env bash
set -euo pipefail
binary=$(mktemp /tmp/plantclassifier-gate.XXXXXX)
trap 'rm -f "$binary"' EXIT
g++ -std=c++17 -Wall -Wextra -Werror ESP32/tests/command_gate_test.cpp -o "$binary"
"$binary"
# A simulation build must reject enabling the physical diagnostic endpoint.
if printf '#define SIMULATION_MODE 1\n#define ENABLE_SELFTEST_ENDPOINT 1\n#include "ESP32/Movement/simulation_config.h"\n' | g++ -I. -x c++ -fsyntax-only - >/dev/null 2>&1; then
  echo 'FAIL: simulation permits the physical diagnostic endpoint' >&2; exit 1
fi
echo 'PASS: simulation rejects physical diagnostic configuration'
for mode in 0 1; do
  g++ -std=c++17 -Wall -Wextra -Werror -DSIMULATION_MODE=$mode ESP32/tests/actuators_test.cpp -o "$binary"
  "$binary"
done
g++ -std=c++17 -Wall -Wextra -Werror ESP32/tests/sensor_inputs_test.cpp -o "$binary"
"$binary"
python3 scripts/test-firmware-roles.py
scripts/test-sensor-http.sh
