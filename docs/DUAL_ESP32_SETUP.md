# Two independent ESP32 controllers

The sensor board runs `ESP32/PlantClassifier/PlantClassifier.ino`. It exposes authenticated
`GET /status` and `GET /capture` only. Movement/session requests return 404. The movement
board runs `ESP32/Movement/Movement.ino`: authenticated `GET /status`,
`POST /control-session`, and `POST /movement`. It has no capture endpoint.
The optional physical diagnostic endpoint remains disabled (`ENABLE_SELFTEST_ENDPOINT=0`).

Spring already has independent `sensorClient` and `movementClient` beans. Capture uses
`ESP32_URL`; movement uses `MOVEMENT_ESP32_URL`. Both send `X-Device-Token`.
URLs must be HTTP(S) origins, with no credentials, path, query, or fragment; malformed
values such as `http://http://...` fail startup. Do not point both variables at one board.

## Sensor wiring and input contract

This code targets **classic ESP32**, compiled as `esp32:esp32:esp32`. This is not proof
of the attached board's identity: inspect its module marking and schematic before wiring.
Other ESP32 families deliberately fail the compile-time target guard.

| Connection | Sensor ESP32 |
|---|---|
| DHT11 DATA | GPIO 22 |
| DHT11 VCC / GND | compatible 3.3 V supply / GND |
| DHT11 DATA pull-up | 10 kΩ to 3.3 V if not already present on module |
| Potentiometer outer terminal | compatible 3.3 V reference |
| Potentiometer other outer terminal | GND |
| Potentiometer wiper | GPIO 34 |

GPIO34 is input-only ADC1 channel 6 on the classic ESP32, usable alongside WiFi.
The sketch explicitly configures 12-bit acquisition (0–4095) and `ADC_11db` attenuation.
Espressif documents an approximate 150–3100 mV measurement range at this attenuation;
3.3 V can saturate the ADC. Attenuation does **not** grant permission to exceed GPIO
voltage ratings. Use only the verified board's 3.3 V domain, never 5 V on DATA or ADC,
and never exceed that board's rated input voltage. Avoid feeding inputs on an unpowered board.
Exact board identity, supply voltage, and wiring have not been physically verified.
See [Espressif ADC API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/adc.html)
and [ESP32 datasheet](https://www.espressif.com/sites/default/files/documentation/esp32_datasheet_en.pdf).

The physical acquisition path averages eight bounded ADC samples and maps their mean
linearly to 0–14. This is **pH (potentiometer simulation)**, not calibrated chemical pH.
ADC nonlinearity and rail saturation are acceptable for this demonstration, not for a probe.
DHT11 temperature and humidity must be finite and within 0–50 °C and 20–80% RH,
respectively ([Adafruit specifications](https://www.adafruit.com/product/386)).
The firmware samples at most once per 2000 ms, returning the cached sample inside that
interval with `sampleAgeMs`. A failed sample returns HTTP 503 throughout the interval;
it never substitutes synthetic values or returns an older successful sample after failure.

Example response (numbers are illustrative, not measurements from your board):

```json
{
  "temperature": 25.0,
  "humidity": 60.0,
  "ph": 6.502564,
  "temperatureSource": "dht11",
  "humiditySource": "dht11",
  "phSource": "potentiometer",
  "simulated": true,
  "sampleAgeMs": 0
}
```

`simulated=true` indicates the demonstration environmental quantity. It does not imply
that DHT readings are synthetic. Sources persist in additive Flyway migration V3;
legacy rows retain null/unknown sources. The dashboard spells out the potentiometer label.

## Movement wiring and safety

| Connection | Movement ESP32 |
|---|---|
| TB6612FNG AIN1 / AIN2 | GPIO 25 / GPIO 26 |
| TB6612FNG PWMA / STBY | GPIO 27 / GPIO 32 |
| Steering servo signal | GPIO 22 |

GPIO22 on these two separate boards is independent. Keep an external STBY pull-down,
common logic ground, compatible driver logic supply, and independently disconnectable
motor/servo supplies. Do not power motors or the servo from an ESP32 GPIO or its 3.3 V rail.
Verify driver, motor and servo supply specifications and actual wiring separately.
Channel B is unused. Existing motor channel 2/timer 1 and servo timer 0 separation,
STOP, reversal interlock, PWM fault latch, sessions, increasing sequences, device-relative
deadlines, 1500 ms watchdog, and WiFi-loss safety are retained.

`SIMULATION_MODE=1` is the default. Keep `ENABLE_SELFTEST_ENDPOINT=0`.
Only a separately authorized and physically reviewed build may use `SIMULATION_MODE=0`.
No firmware was uploaded and no motors were energized during this change.

## Ubuntu configuration and compile-only checks

Run from the repository root. Arduino CLI must be installed and on PATH; in this
workspace it is also available at `/tmp/plant-arduino/arduino-cli`.

```bash
export PATH=/tmp/plant-arduino:$PATH
arduino-cli core update-index --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core install esp32:esp32@3.3.11 --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli lib install 'ArduinoJson@7.4.3' 'ESP32Servo@3.2.1' 'DHT sensor library@1.4.7' 'Adafruit Unified Sensor@1.1.15'
# Create missing local files only; never overwrite existing credentials.
test -f ESP32/PlantClassifier/wifi_config.h || cp ESP32/PlantClassifier/wifi_config.example.h ESP32/PlantClassifier/wifi_config.h
test -f ESP32/Movement/wifi_config.h || cp ESP32/Movement/wifi_config.example.h ESP32/Movement/wifi_config.h
arduino-cli board list
ARDUINO_CLI=arduino-cli ESP32_FQBN=esp32:esp32:esp32 scripts/compile-firmware.sh
```

Edit each ignored `wifi_config.h` locally with its WiFi SSID/password and the same existing
`DEVICE_TOKEN` as Spring (at least 32 characters). Do not publish credentials.
Sensor configuration is `DHTPIN=22`, `DHTTYPE=DHT11`, `PH_PIN=34`, `PH_ADC_BITS=12`,
`SENSOR_INTERVAL_MS=2000` in `sensor_config.h`; physical inputs are always enabled.
Old local `SENSOR_SIMULATION_MODE`, `REAL_SENSOR_MODE`, `SIMULATION_MODE`, and pH
calibration macros have no effect on this sensor sketch. Software-only testing uses the
separate Python sensor simulator. Movement only uses its own `SIMULATION_MODE` flag.

The compile script copies placeholders into temporary sketches, compiles real sensor,
simulated movement, and hardware movement builds, and checks simulated movement objects
for actuator calls. It never copies private WiFi headers and never uploads.
After separate upload approval, select the correct physical board for each sketch in
Arduino IDE. Upload **PlantClassifier.ino to sensor ESP32 #1**, **Movement.ino to movement
ESP32 #2**. Read each IP from the 115200 baud Serial Monitor; alternatively use your
router's DHCP lease list. Identify each board independently; do not assume DHCP addresses.

## Docker and end-to-end operation

In your existing private environment file, set distinct actual addresses:

```ini
ESP32_URL=http://SENSOR_ESP32_IP
MOVEMENT_ESP32_URL=http://MOVEMENT_ESP32_IP
```

Keep the existing database project name and credentials. For the established lab project:

```bash
# Physical device URLs, after separately approved firmware deployment:
docker compose -p plantclassifier-lab --env-file .env.lab -f docker-compose.yaml config --quiet
docker compose -p plantclassifier-lab --env-file .env.lab -f docker-compose.yaml up -d --build --wait
# Fully software-driven two-device lab (safe movement default):
docker build -t plantclassifier-lab-app .
docker compose -p plantclassifier-lab --env-file .env.lab -f docker-compose.yaml -f docker-compose.simulation.yaml up -d --wait
```

The simulation overlay always starts independent sensor and movement servers on host
ports 18082 and 18081. Each exposes only its role's endpoints. Their sources are honestly
labeled `software`. The old split overlay remains compatible but is no longer necessary.
Never use `down -v`; no existing measurement records or volumes need deletion.

Set `SENSOR_URL` and `MOVEMENT_URL` to the observed physical IPs (or local simulator URLs),
then read the token without placing it in command history:

```bash
read -rsp 'Device token: ' DEVICE_TOKEN; echo
export DEVICE_TOKEN
SENSOR_URL=http://SENSOR_ESP32_IP
MOVEMENT_URL=http://MOVEMENT_ESP32_IP
curl --fail-with-body -H "X-Device-Token: $DEVICE_TOKEN" "$SENSOR_URL/status"
curl --fail-with-body -H "X-Device-Token: $DEVICE_TOKEN" "$MOVEMENT_URL/status"
curl --fail-with-body -H "X-Device-Token: $DEVICE_TOKEN" "$SENSOR_URL/capture"
```

Sensor status must show `role=sensor`, `mode=physical-sensors`, `dht11` sources and
`phSource=potentiometer`. Movement must show `role=movement`, `mode=simulation`,
`hardwareOutputEnabled=false` before any automated movement test.
Sign in to the dashboard and click Capture Data. Check the DHT and potentiometer source
labels, capture time and successful crop prediction. Turn the potentiometer and wait at
least two seconds before capturing again: the pH demonstration value should change while
DHT values come from the room. Disconnecting DHT DATA should cause an explicit failure
after the cache interval, with no new measurement saved. Reconnect only with appropriate
power/wiring precautions. These physical checks remain pending.

Capture saves validated values to PostgreSQL before predicting. `MLService` invokes the
existing Python model with exactly `temperature, humidity, ph`; the model is unchanged.
For standalone inference inside the running application container:

```bash
docker compose -p plantclassifier-lab --env-file .env.lab exec -T app /opt/venv/bin/python3 /app/MLClassification/predict.py 25 60 6.5
```

With simulation verified, W/S/A/D acquire control automatically, release sends STOP,
and focus loss stops control. Sensor capture is independent. There is no Acquire Control button.

## Reproducible software validation

```bash
scripts/test-firmware.sh
npm test
python3 scripts/test-simulator.py
JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 scripts/test-postgres.sh -B verify
PLANT_TEST_IMAGE=plantclassifier-lab-app python3 scripts/smoke-docker.py
CHROME_PATH=/usr/bin/google-chrome PLANT_BASE_URL=http://127.0.0.1:18080 PLANT_DEVICE_URL=http://127.0.0.1:18081 node scripts/with-lab-env.mjs .env.lab npm run test:e2e
```

The smoke test uses disposable containers, separate role-specific device servers and actual
Python inference. Browser tests verify keyboard safety, capture, saved latest data, source
labels, and failures. The mixed-source browser fixture is explicitly mocked. Automated
DHT/ADC tests exercise production acquisition logic with mocks; no sensor accuracy claim
is made. Never run movement suites against an actuator-enabled robot.

## Troubleshooting and future pH probe

- Connection failure: inspect each Serial IP, DHCP, WiFi reachability from Docker and both
  URL variables. `/capture` on the movement board must return 404, not fallback data.
- 401: confirm the existing token is identical in Spring and both private headers; do not log it.
- Sensor 503: check DATA GPIO22, supply, pull-up, sensor type and rated operating range.
  Allow two seconds between attempts. A failed read is not a request to switch to simulation.
- Constant pH near 0 or 14: check wiper continuity, GPIO34, common ground and ADC saturation.
  Never increase voltage to fix a saturated ADC.
- Prediction failure: inspect `predictionStatus` / `predictionError`, model file availability
  and container Python dependencies. The measurement remains saved even if prediction fails.
- Flyway failure: inspect schema history and database connectivity; never delete data to fix it.

For a genuine pH probe, add an electrically compatible high-impedance conditioned interface,
verify voltage limits, calibrate with certified buffers and validate temperature compensation
and accuracy. Replace `demoPH` acquisition with the validated probe adapter, set
`phSource=calibrated-ph-probe`, and set `simulated=false` only when all environmental
quantities are measured. Backend already accepts that source. Preserve the JSON numeric
`ph` field and Python feature order; no model retraining is part of this upgrade.
