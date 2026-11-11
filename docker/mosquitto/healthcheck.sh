#!/bin/sh
set -eu
mosquitto_pub -h 127.0.0.1 -p 1883 -u health -P "$(cat /mosquitto/secrets/health-password)" -t plant/health -m health -q 1
