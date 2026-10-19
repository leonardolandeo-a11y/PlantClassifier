# Dual ESP32 validation — 2026-10-19

All verification is software-only. No firmware was flashed; no physical motor commands
were sent. Local WiFi headers, `.env` files, tokens, database volumes, and `model.pkl`
were not modified.

| Check | Result |
|---|---|
| Firmware command gate, STOP/watchdog, actuator mocks in modes 0 and 1 | PASS |
| Physical DHT/ADC acquisition with mocks, mapping, bounds, invalid values | PASS |
| Actual sensor sketch with real ArduinoJson and mocked I/O | PASS: authentication, JSON, roles, 2 s caching, failure and recovery |
| ESP32 Arduino compilation | PASS: sensor, simulated movement, hardware movement; no upload |
| Simulation object inspection | PASS: movement sketch has no actuator or sensor I/O references |
| Frontend protocol unit suite | 16 passed |
| Java/PostgreSQL suite | 38 passed, 0 failed, 0 skipped |
| Two independent simulated device HTTP servers | PASS: role isolation, token, STOP, sequences, deadlines, watchdog |
| Docker build | PASS |
| Docker integration | PASS: two device URLs, authentication/CSRF, actual Python model inference, PostgreSQL/latest reading |
| Headless Chrome | PASS: keyboard acquisition/release/blur/network safety, capture, real ML, persistence reload, source display, logout |
| Python pipeline suite inside image | 3 passed; existing model loaded successfully |
| Whitespace/diff check | PASS |

Compiled target: classic ESP32 `esp32:esp32:esp32`, Arduino ESP32 Core 3.3.11,
ArduinoJson 7.4.3, ESP32Servo 3.2.1, DHT sensor library 1.4.7,
Adafruit Unified Sensor 1.1.15. This target is not a physical board identification.

Logs from this run: `/tmp/dual-java.log`, `/tmp/dual-firmware.log`,
`/tmp/dual-docker.log`, `/tmp/dual-smoke.log`, `/tmp/dual-browser.log`,
`/tmp/dual-lab.log`. Logs in /tmp are transient. Reproduction commands are in
[DUAL_ESP32_SETUP.md](DUAL_ESP32_SETUP.md).

Initial local network/container test attempts were blocked by the sandbox and succeeded
after approved execution. The previous host Python virtual environment was unavailable;
Python tests ran successfully in the built image instead. There are no unresolved test failures.

The lab app is left running against two software device servers, preserving its existing
PostgreSQL volume. The browser capture adds simulated measurements to that lab database.
Docker smoke/PostgreSQL migration tests used isolated temporary databases.

Model SHA-256 (unchanged):
`7554a7b1c458d6d1f0306eb3fb6316cbc916b4ff861d04bff0770dd3475d1f73`.
Feature order remains `temperature`, `humidity`, `ph`.

Still pending: exact board/module identification, supply/input voltage measurements,
physical DHT accuracy and failure checks, potentiometer wiring/full travel behavior,
physical WiFi behavior, motor/servo wiring, mechanical calibration, stopping/reversal
performance, and real actuator validation. The mixed-source browser test is a fixture,
not evidence of physical measurement. Separate approval is required before firmware upload
or physical motor energization.
