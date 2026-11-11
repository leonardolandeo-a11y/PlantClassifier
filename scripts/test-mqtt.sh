#!/usr/bin/env bash
# Isolated broker on loopback, mock ESP32 clients only. No production Compose or hardware access.
set -euo pipefail
work=$(mktemp -d /tmp/plant-mqtt-test.XXXXXX)
container="plant-mqtt-test-$(date +%s)-$$"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT
chmod 755 "$work"
cat > "$work/mosquitto.conf" <<'CONFIG'
listener 1883
allow_anonymous true
persistence false
queue_qos0_messages false
CONFIG
chmod 644 "$work/mosquitto.conf"
port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')
docker run -d --name "$container" -p "127.0.0.1:$port:1883" -v "$work/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro" eclipse-mosquitto:2.0.22 >/dev/null
export MQTT_TEST_URL="tcp://$(docker port "$container" 1883/tcp)"
export MQTT_TEST_CONTAINER="$container"
./mvnw -Dfrontend.skip=true -Dtest=MqttTransportTest test

if [[ -n "${DIAGNOSTIC_PYTHON:-}" ]]; then
  "$DIAGNOSTIC_PYTHON" scripts/test-diagnostics.py
fi
