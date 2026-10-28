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
# Verify the two sketches keep independent roles.
python3 - <<'PYTHON'
from pathlib import Path
sensor = Path('ESP32/PlantClassifier/PlantClassifier.ino').read_text()
movement = Path('ESP32/Movement/Movement.ino').read_text()
assert '"/movement"' not in sensor and '"/control-session"' not in sensor
assert '"/capture"' not in movement and 'simulated_capture' not in movement
assert 'dht.begin()' in sensor and 'analogRead(pin)' in sensor
for source in ('temperatureSource', 'humiditySource', 'phSource'):
    assert source in sensor
for path in Path('ESP32/PlantClassifier').glob('*'):
    if path.name == 'wifi_config.h': continue
    assert 'command_gate' not in path.read_text() and 'robotStop' not in path.read_text()
print('PASS dedicated firmware roles and source JSON fields')
PYTHON

json_include=${ARDUINOJSON_INCLUDE:-$HOME/Arduino/libraries/ArduinoJson/src}
if [ ! -f "$json_include/ArduinoJson.h" ]; then
  echo 'Install ArduinoJson or set ARDUINOJSON_INCLUDE to its src directory' >&2; exit 1
fi
work=$(mktemp -d /tmp/plant-sensor-test.XXXXXX)
trap 'rm -f "$binary"; rm -rf "$work"' EXIT
cp ESP32/PlantClassifier/PlantClassifier.ino ESP32/PlantClassifier/sensor_*.h "$work/"
cat > "$work/wifi_config.h" <<'CONFIG'
const char* WIFI_SSID="mock";
const char* WIFI_PASSWORD="mock";
const char* DEVICE_TOKEN="mock-device-token-at-least-32-characters";
CONFIG
g++ -std=c++17 -Wall -Wextra -Werror -DCONFIG_IDF_TARGET_ESP32 \
  -IESP32/tests/sensor_mocks -I"$work" -I"$json_include" ESP32/tests/sensor_http_test.cpp -o "$work/test"
"$work/test"
