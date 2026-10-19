#!/usr/bin/env bash
set -euo pipefail
json_include=${ARDUINOJSON_INCLUDE:-$HOME/Arduino/libraries/ArduinoJson/src}
if [ ! -f "$json_include/ArduinoJson.h" ]; then
  echo 'Install ArduinoJson or set ARDUINOJSON_INCLUDE to its src directory' >&2; exit 1
fi
work=$(mktemp -d /tmp/plant-sensor-test.XXXXXX)
trap 'rm -rf "$work"' EXIT
cp ESP32/PlantClassifier/PlantClassifier.ino ESP32/PlantClassifier/sensor_*.h "$work/"
cat > "$work/wifi_config.h" <<'CONFIG'
const char* WIFI_SSID="mock";
const char* WIFI_PASSWORD="mock";
const char* DEVICE_TOKEN="mock-device-token-at-least-32-characters";
CONFIG
g++ -std=c++17 -Wall -Wextra -Werror -DCONFIG_IDF_TARGET_ESP32 \
  -IESP32/tests/sensor_mocks -I"$work" -I"$json_include" ESP32/tests/sensor_http_test.cpp -o "$work/test"
"$work/test"
