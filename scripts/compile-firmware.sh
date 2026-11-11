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
  for header in ESP32/"$sketch"/*.h; do
    [[ "$(basename "$header")" = wifi_config.h || "$(basename "$header")" = mqtt_config.h ]] || cp "$header" "$work/$sketch/"
  done
  cat > "$work/$sketch/wifi_config.h" <<'CONFIG'
#pragma once
const char* WIFI_SSID = "compile-only";
const char* WIFI_PASSWORD = "compile-only";
const char* DEVICE_TOKEN = "compile-only-not-a-real-token-000000000000";
#define SIMULATION_MODE 1
CONFIG
  "$cli" compile --libraries "$PWD/ESP32/libraries" --fqbn "$fqbn" --build-path "$work/build-$sketch" "$work/$sketch"
  # Compile MQTT path too, using placeholders only. Never copy local technical secrets.
  cp "ESP32/$sketch/mqtt_config.h.example" "$work/$sketch/mqtt_config.h"
  "$cli" compile --libraries "$PWD/ESP32/libraries" --fqbn "$fqbn" --build-path "$work/build-$sketch-mqtt" "$work/$sketch"
  rm "$work/$sketch/mqtt_config.h"
  # Inspect only sketch output: WiFi libraries legitimately use hardware internally.
  object="$work/build-$sketch/sketch/$sketch.ino.cpp.o"
  nm_tool=$(find "${ARDUINO_DATA_DIR:-$HOME/.arduino15}/packages/esp32/tools" -type f -name '*-nm' | head -1)
  if [ -z "$nm_tool" ]; then echo 'ESP32 nm tool missing; cannot verify sketch output safety' >&2; exit 1; fi
  if [ "$sketch" = Movement ] && "$nm_tool" -u -C "$object" | grep -E 'digitalWrite|pinMode|analogWrite|analogRead|ledc(Write|Attach|Setup|Read)|Servo::|DHT::'; then
    echo 'FAIL: simulation sketch references hardware output or sensor input functions' >&2; exit 1
  fi
  echo "PASS $sketch: ESP32 compiled; movement simulation checked for hardware I/O"
done

# Compile future hardware branches only; these artifacts are never uploaded by this script.
sed -i 's/#define SIMULATION_MODE 1/#define SIMULATION_MODE 0/' "$work/Movement/wifi_config.h"
"$cli" compile --libraries "$PWD/ESP32/libraries" --fqbn "$fqbn" --build-path "$work/build-hardware" "$work/Movement"
echo 'PASS Movement: hardware branch compiles (not flashed or exercised)'

cp ESP32/Movement/mqtt_config.h.example "$work/Movement/mqtt_config.h"
"$cli" compile --libraries "$PWD/ESP32/libraries" --fqbn "$fqbn" --build-path "$work/build-hardware-mqtt" "$work/Movement"
echo 'PASS Movement: MQTT hardware branch compiles (not flashed)'
