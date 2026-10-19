#!/usr/bin/env bash
# Compile-only validation. Uses placeholder credentials in a temporary sketch, never flashes.
set -euo pipefail
cli=${ARDUINO_CLI:-arduino-cli}
fqbn=${ESP32_FQBN:-esp32:esp32:esp32}
work=$(mktemp -d /tmp/plant-firmware.XXXXXX)
trap 'rm -rf "$work"' EXIT
for sketch in Movement PlantClassifier; do
  mkdir -p "$work/$sketch"
  cp "ESP32/$sketch/$sketch.ino" "$work/$sketch/"
  cp "ESP32/$sketch/command_gate.h" "ESP32/$sketch/control_protocol.h" \
    "ESP32/$sketch/simulation_config.h" "ESP32/$sketch/simulated_capture.h" "$work/$sketch/"
  if [ "$sketch" = Movement ]; then
    cp ESP32/Movement/actuators.h ESP32/Movement/hardware_config.h ESP32/Movement/movement_safety.h "$work/$sketch/"
  fi
  cat > "$work/$sketch/wifi_config.h" <<'CONFIG'
#pragma once
const char* WIFI_SSID = "compile-only";
const char* WIFI_PASSWORD = "compile-only";
const char* DEVICE_TOKEN = "compile-only-not-a-real-token-000000000000";
#define SIMULATION_MODE 1
#define SENSOR_SIMULATION_MODE 1
#define ENABLE_SELFTEST_ENDPOINT 0
CONFIG
  "$cli" compile --fqbn "$fqbn" --build-path "$work/build-$sketch" "$work/$sketch"
  # Inspect only sketch output: WiFi libraries legitimately use hardware internally.
  object="$work/build-$sketch/sketch/$sketch.ino.cpp.o"
  nm_tool=$(find "${ARDUINO_DATA_DIR:-$HOME/.arduino15}/packages/esp32/tools" -type f -name '*-nm' | head -1)
  if [ -z "$nm_tool" ]; then echo 'ESP32 nm tool missing; cannot verify sketch output safety' >&2; exit 1; fi
  if "$nm_tool" -u -C "$object" | grep -E 'digitalWrite|pinMode|analogWrite|analogRead|ledc(Write|Attach|Setup|Read)|Servo::|DHT::'; then
    echo 'FAIL: simulation sketch references hardware output or sensor input functions' >&2; exit 1
  fi
  echo "PASS $sketch: ESP32 compiled; no GPIO, PWM, servo or sensor I/O references in sketch object"
done

# Compile future hardware branches only; these artifacts are never uploaded by this script.
sed -i 's/#define SIMULATION_MODE 1/#define SIMULATION_MODE 0/' "$work/Movement/wifi_config.h"
"$cli" compile --fqbn "$fqbn" --build-path "$work/build-hardware" "$work/Movement"
echo 'PASS Movement: hardware branch compiles (not flashed or exercised)'
sed -i 's/#define SENSOR_SIMULATION_MODE 1/#define SENSOR_SIMULATION_MODE 0/' "$work/PlantClassifier/wifi_config.h"
# Placeholder calibration is for compilation only, never a deployable sensor calibration.
printf '\n#define PH_ADC_AT_7 2000\n#define PH_ADC_AT_4 3000\n' >> "$work/PlantClassifier/wifi_config.h"
"$cli" compile --fqbn "$fqbn" --build-path "$work/build-real-sensors" "$work/PlantClassifier"
echo 'PASS PlantClassifier: real sensor branch compiles (not calibrated, flashed or exercised)'
