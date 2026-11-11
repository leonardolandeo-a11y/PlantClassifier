#!/usr/bin/env bash
set -euo pipefail
binary=$(mktemp /tmp/plantclassifier-gate.XXXXXX)
trap 'rm -f "$binary"' EXIT
g++ -std=c++17 -Wall -Wextra -Werror ESP32/tests/command_gate_test.cpp -o "$binary"
"$binary"
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
# Diagnostics are absent in both modes, rather than conditionally enabled.
for path in Path('ESP32/Movement').glob('*'):
    if path.name == 'wifi_config.h': continue
    for removed in ('"/test"', 'selfTest', 'diagnosticRunning', 'diagnosticDeadline', 'ENABLE_SELFTEST_ENDPOINT'):
        assert removed not in path.read_text(), (path, removed)
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
cp ESP32/PlantClassifier/PlantClassifier.ino ESP32/PlantClassifier/sensor_*.h ESP32/PlantClassifier/transport.h "$work/"
cat > "$work/wifi_config.h" <<'CONFIG'
#pragma once
const char* WIFI_SSID="mock";
const char* WIFI_PASSWORD="mock";
const char* DEVICE_TOKEN="mock-device-token-at-least-32-characters";
CONFIG
g++ -std=c++17 -Wall -Wextra -Werror -DCONFIG_IDF_TARGET_ESP32 \
  -IESP32/tests/sensor_mocks -I"$work" -I"$json_include" ESP32/tests/sensor_http_test.cpp -o "$work/test"
"$work/test"

# Exercise the real movement HTTP handler in both modes, with mock I/O only.
mkdir -p "$work/Movement"
cp ESP32/Movement/Movement.ino "$work/Movement/"
for header in ESP32/Movement/*.h; do
  [[ "$(basename "$header")" = wifi_config.h || "$(basename "$header")" = mqtt_config.h ]] || cp "$header" "$work/Movement/"
done
cp "$work/wifi_config.h" "$work/Movement/wifi_config.h"
for mode in 0 1; do
  g++ -std=c++17 -Wall -Wextra -Werror -DCONFIG_IDF_TARGET_ESP32 -DSIMULATION_MODE=$mode \
    -IESP32/tests/movement_mocks -I"$work/Movement" -I"$json_include" ESP32/tests/movement_http_test.cpp -o "$work/movement-test"
  "$work/movement-test"
done

# MQTT dispatch uses the same production handlers, bounded queues and priority path.
# Mock scheduler never starts a network task; all GPIO/servo writes remain mocked.
for sketch in Movement PlantClassifier; do
  test_dir="$work"
  mocks=ESP32/tests/sensor_mocks
  source=ESP32/tests/sensor_mqtt_test.cpp
  if [[ "$sketch" == Movement ]]; then test_dir="$work/Movement"; mocks=ESP32/tests/movement_mocks; source=ESP32/tests/movement_mqtt_test.cpp; fi
  cp "ESP32/$sketch/mqtt_config.h.example" "$test_dir/mqtt_config.h"
  g++ -std=c++17 -Wall -Wextra -Werror -DCONFIG_IDF_TARGET_ESP32 -DSIMULATION_MODE=0 \
    -I"$mocks" -IESP32/tests/mqtt_mocks -IESP32/tests -IESP32/libraries/PlantMqtt/src \
    -I"$test_dir" -I"$json_include" "$source" -o "$work/mqtt-test"
  "$work/mqtt-test"
done
