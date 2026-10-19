# USB-only demonstration and integration testing

The default firmware has `SIMULATION_MODE=1` and `SENSOR_SIMULATION_MODE=1`.
No motor driver, motor, servo, wheels or sensor is needed. Wi-Fi must still be reachable from the laptop and Docker containers; USB supplies power, firmware upload and Serial Monitor access, not HTTP networking.

## Ubuntu: run the lab without an ESP32

Run from the repository root. These commands preserve `.env`, `.env.lab`, and existing database volumes. The optional overlay changes the running app's device addresses without editing the environment file. The software simulator uses the lab's existing `DEVICE_TOKEN` and is exposed only on loopback.

```bash
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
./mvnw verify
npm ci
npm run typecheck
npm test
npm run build
scripts/test-firmware.sh
python3 scripts/test-simulator.py
scripts/test-postgres.sh -B verify  # full Java suite with isolated PostgreSQL

docker compose -p plantclassifier-lab --env-file .env.lab config --quiet
docker compose -p plantclassifier-lab --env-file .env.lab up -d --build
docker compose -p plantclassifier-lab --env-file .env.lab \
  -f docker-compose.yaml -f docker-compose.simulation.yaml config --quiet
docker compose -p plantclassifier-lab --env-file .env.lab \
  -f docker-compose.yaml -f docker-compose.simulation.yaml up -d
```

Open <http://127.0.0.1:18080/login>. Sign in using the existing lab operator credentials. The dashboard shows authentication state and offers **Sign out**. Press a direction to acquire control automatically. W/S/A/D send FORWARD/BACKWARD/LEFT/RIGHT. The most recently pressed key wins; releasing it resumes another held key. Releasing all keys or clicking STOP closes the control session; the next fresh keypress acquires a new session automatically. Text fields ignore movement keys.

Click **Capture Data**. The dashboard labels synthetic values and displays the actual model prediction after PostgreSQL persistence. Test captures add labeled rows to the lab database; scripts do not delete those rows.

Observe actual **software simulator output**, which is not ESP32 serial output:

```bash
docker compose -p plantclassifier-lab --env-file .env.lab \
  -f docker-compose.yaml -f docker-compose.simulation.yaml logs -f simulator
```

Reusable device protocol tests read credentials without printing them:

```bash
node scripts/with-lab-env.mjs .env.lab python3 scripts/test-device.py \
  --url http://127.0.0.1:18081
```

Run the actual browser workflow with Chrome already installed:

```bash
CHROME_PATH=/usr/bin/google-chrome \
PLANT_BASE_URL=http://127.0.0.1:18080 PLANT_DEVICE_URL=http://127.0.0.1:18081 \
node scripts/with-lab-env.mjs .env.lab npm run test:e2e
```

If Chrome is absent, `npx playwright install chromium` installs the test browser; omit `CHROME_PATH` afterward. Browser tests refuse movement when the supplied device `/status` does not explicitly report simulation with hardware outputs disabled. Supply the movement device actually configured in the backend. Normal movement and captures use the real simulator HTTP stack. Race checks deliberately delay acquisition and movement requests; error checks inject failed HTTP responses and a network abort.

The standalone Docker smoke test uses its own disposable containers and no user volume:

```bash
PLANT_TEST_IMAGE=plantclassifier-lab-app python3 scripts/smoke-docker.py
```

## USB ESP32: identify, compile, upload, observe

1. Connect the ESP32 through a data-capable USB cable. Do not connect actuators. Install Arduino CLI, ESP32 Arduino Core 3.x, and ArduinoJson 7. Existing hardware branch compilation also needs ESP32Servo and Adafruit DHT/Unified Sensor libraries.

   ```bash
   arduino-cli core update-index --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
   arduino-cli core install esp32:esp32 --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
   arduino-cli lib install ArduinoJson ESP32Servo 'DHT sensor library' 'Adafruit Unified Sensor'
   arduino-cli board list
   ls -l /dev/serial/by-id/
   ```

   Match the USB device, chip and board model physically. A generic USB-UART bridge does not by itself establish the board model. If multiple devices or an unknown board remain, do not upload until identified. Linux serial access may require membership in `dialout` and a new login.

2. Choose `ESP32/Movement` for the recommended combined movement/sensor simulator. Create its ignored `wifi_config.h` from the example only if it does not already exist:

   ```bash
   test -e ESP32/Movement/wifi_config.h || cp ESP32/Movement/wifi_config.example.h ESP32/Movement/wifi_config.h
   chmod 600 ESP32/Movement/wifi_config.h
   ${EDITOR:-nano} ESP32/Movement/wifi_config.h
   ```

   Set Wi-Fi credentials and the same device token as `.env.lab` privately. Keep:

   ```cpp
   #define SIMULATION_MODE 1
   #define SENSOR_SIMULATION_MODE 1
   #define ENABLE_SELFTEST_ENDPOINT 0
   ```

3. Run compile-only regression checks. This script uses temporary placeholder credentials, inspects the simulation sketch objects for hardware calls and also compiles the future real hardware/sensor branches. It never uploads any artifact. Placeholder calibration in those compile checks is not a valid sensor calibration.

   ```bash
   ARDUINO_CLI=arduino-cli ESP32_FQBN=esp32:esp32:esp32 scripts/compile-firmware.sh
   ```

4. Compile the actual local simulation configuration using the **identified** board's FQBN. The generic ESP32 FQBN below is an example, not proof of board identity. Set PORT from discovery and FQBN from the physical board selection:

   ```bash
   export PORT=/dev/serial/by-id/REPLACE_WITH_IDENTIFIED_DEVICE
   export FQBN=esp32:esp32:esp32
   arduino-cli compile --fqbn "$FQBN" --build-path /tmp/plant-usb-simulation ESP32/Movement
   ```

   Confirm the local flags above remain enabled and the compile succeeded. Upload only this freshly compiled simulation build to that identified target:

   ```bash
   arduino-cli upload --fqbn "$FQBN" --port "$PORT" --input-dir /tmp/plant-usb-simulation ESP32/Movement
   arduino-cli monitor --port "$PORT" --config baudrate=115200
   ```

   Press reset with the monitor open to capture the startup mode banner. A zero IP or connection failure is not readiness. Obtain the actual IP from `[WIFI] IP:`; do not assume a previous DHCP lease such as `192.168.100.17` is still valid.

5. Keep Serial Monitor open in one terminal. Verify authenticated status and execute the safe protocol tests in another:

   ```bash
   export VERIFIED_ESP32_URL=http://REPLACE_WITH_SERIAL_IP
   node scripts/with-lab-env.mjs .env.lab python3 scripts/test-device.py --url "$VERIFIED_ESP32_URL"
   ```

   This test first checks `/status` and refuses movement unless `mode=simulation` and `hardwareOutputEnabled=false`. It tests token rejection, all six commands, repeated and invalid sequences, deadlines, STOP invalidation, watchdog expiry and synthetic sensor ranges. Requests include `sessionId`, monotonically increasing `sequence`, and device-relative `deadlineMs` derived from `/control-session`.

6. Route the backend to the verified board without changing either environment file. Omitting the software overlay restores the normal Compose definition; explicit shell overrides set only device URLs:

   ```bash
   ESP32_URL="$VERIFIED_ESP32_URL" MOVEMENT_ESP32_URL="$VERIFIED_ESP32_URL" \
     docker compose -p plantclassifier-lab --env-file .env.lab up -d app
   CHROME_PATH=/usr/bin/google-chrome PLANT_DEVICE_URL="$VERIFIED_ESP32_URL" \
     node scripts/with-lab-env.mjs .env.lab npm run test:e2e
   ```

   Sign in manually as well, press/release W then A without clicking an acquisition button. Correlate the accepted commands with actual serial output. Capture sensors and confirm the simulated label and prediction. Temporarily disconnect Wi-Fi while a command is active and confirm the serial failsafe; reconnect, verify the IP and release/repress a movement key. Actual radio-loss behavior must be checked on hardware.

## One board or two boards

| Architecture | Movement firmware/address | Sensor firmware/address |
|---|---|---|
| One ESP32, USB demo | `Movement`, both simulation flags 1 | Same board exposes `/capture`; both URLs identical |
| Two ESP32s, USB demo | `Movement`, `SIMULATION_MODE=1` | `PlantClassifier`, both flags 1; `ESP32_URL` points here |
| Future robot | `Movement`, explicitly set `SIMULATION_MODE=0` after hardware validation | `PlantClassifier`, `SENSOR_SIMULATION_MODE=0` only after wiring and calibration |

For two boards, set `MOVEMENT_ESP32_URL` and `ESP32_URL` to their independently observed addresses; tokens must match the backend. The Movement sketch can omit its synthetic capture endpoint with `SENSOR_SIMULATION_MODE=0`; real sensor reads belong to PlantClassifier. Legacy `REAL_SENSOR_MODE=1` is honored when the new sensor flag is absent. `PlantClassifier` never actuates movement hardware and rejects `SIMULATION_MODE=0`.

To demonstrate two independent devices without physical boards:

```bash
docker compose -p plantclassifier-lab --env-file .env.lab \
  -f docker-compose.yaml -f docker-compose.simulation.yaml \
  -f docker-compose.simulation-split.yaml up -d --wait
```

The movement simulator remains on port 18081; the independent sensor simulator uses 18082. Repeat the browser command above. Return to one device by running the single-device overlay's `up -d --wait app` command. Both endpoint architectures use the same backend and protocol. Run device protocol tests and browser tests sequentially: each acquires control and intentionally supersedes previous sessions.

## Expected serial output — example only

The following is an example, not a recorded hardware result:

```text
[MODE] SIMULATION - HARDWARE OUTPUT DISABLED
[WIFI] Connected
[WIFI] IP: <actual address>
[HTTP] Server started
[CONTROL] Session acquired
[CMD] FORWARD speed=150
[SIMULATION] FORWARD accepted; hardware output disabled
[CMD] STOP speed=0
[SIMULATION] STOP accepted; hardware output disabled
[CONTROL] Session acquired
[CMD] LEFT speed=0
[SIMULATION] LEFT accepted; hardware output disabled
[CMD] STOP speed=0
[SIMULATION] STOP accepted; hardware output disabled
[SENSOR] SIMULATION ph=6.5 temperature=25.0 humidity=60.0
```

## Safety and session behavior

Simulation excludes actuator writes and ESP32Servo entirely at preprocessing time. Status reports disabled hardware output and acknowledgements report `simulated:true`. Synthetic capture avoids ADC/DHT initialization and I/O. STOP, epoch invalidation, duplicate/expired-command rejection and the independent 1500 ms watchdog remain enabled. Wi-Fi loss invalidates the epoch. Physical mode remains an explicit build choice; no physical-mode artifact was uploaded during this implementation.

The dark native login form includes the session-bound CSRF token and posts to Spring Security. Valid login rotates the session and redirects to `/`; invalid login displays a generic error. Logout requires CSRF, attempts an owner-bound STOP and invalidates the session. Public assets expose no device token. Cookies are HttpOnly and SameSite=Strict. `SESSION_COOKIE_SECURE=false` supports this loopback HTTP lab; set it to true with HTTPS for remote deployment. Do not enable Secure cookies on this HTTP-only demo or the browser will not send them over ordinary HTTP.
