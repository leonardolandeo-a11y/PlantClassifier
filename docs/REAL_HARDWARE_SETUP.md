> Historical reference: firmware roles and sensor configuration were superseded by
> [DUAL_ESP32_SETUP.md](DUAL_ESP32_SETUP.md). Do not use the old shared-device or
> sensor-simulation/calibration instructions below for the current sensor firmware.

# Real movement hardware setup

**Activation is blocked until the owner verifies the wiring, component specifications,
mechanical clearances and safe test setup below. No physical movement has been validated
by the software tests. Do not flash a hardware build or power actuators before that review.**

## Required information and components

Provide the exact ESP32 board/module and revision, driver carrier manufacturer/schematic,
number of drive motors and drivetrain arrangement, each motor's rated voltage, running
and stall current at the intended supply voltage, servo model/datasheet (voltage, stall
current, 3.3 V signal compatibility, pulse range), battery chemistry/cell count/fully
charged voltage/current capability, regulator ratings, fuse/wire ratings and a wiring
photo or diagram. Record measured steering neutral/endpoints and worst-case coast-down
time. The repository proves only that channel A is controlled; it does not establish
whether the chassis has one or multiple motors. **Do not parallel motors or driver
channels, or connect channel B, without a separate reviewed current and control design.**

Required: identified classic ESP32, TB6612FNG carrier, compatible DC drive motor,
steering servo, appropriately rated motor supply and regulated servo supply, common-ground
wiring, decoupling per carrier documentation, suitable fuse/current limiting, secure
wheel stands, meter, and a readily accessible physical actuator-power disconnect.
The disconnect must remove both motor and servo power; keep a person ready to use it.
A scope/logic analyzer is useful for validating PWM before connecting actuators.

## Wiring and electrical review (all power disconnected)

| ESP32 #1 connection | Destination |
|---|---|
| GPIO 25 | AIN1 |
| GPIO 26 | AIN2 |
| GPIO 27 | PWMA, 5 kHz, 8-bit duty 0–255 |
| GPIO 32 | STBY; external pull-down to GND, e.g. 10 kΩ after carrier review |
| GPIO 22 | Servo signal |
| 3V3 | Driver VCC logic supply, subject to carrier compatibility |
| GND | Driver logic/power GND and servo supply GND |
| External motor supply + | Driver VM through fuse and disconnect |
| Driver AO1/AO2 | One reviewed drive motor's two terminals |
| Regulated servo supply + | Servo power through disconnect |
| Channel B | No GPIO assignments; leave outputs unused and hold unused inputs low per carrier instructions |

Use 3.3 V driver logic: the IC's VCC operating range is 2.7–5.5 V, and its input-high
threshold depends on VCC, so 5 V logic supply is not a justified assumption for 3.3 V
GPIO. Check VM against the actual carrier and motor ratings, including a fully charged
battery and regenerative transients. Toshiba lists IC operating VM up to 13.5 V;
absolute maximum and pulse-current ratings are not continuous operating targets.
See the [Toshiba datasheet](https://www.pololu.com/file/0J86/TB6612FNG.pdf) and your carrier
manufacturer. For example, [Pololu's carrier](https://www.pololu.com/product/713/specs)
is rated 1 A continuous per channel and 3 A peak; that is not a rating for an unknown
carrier. Check startup/stall current, thermal dissipation, wiring and supply protection.
Do not rely on thermal shutdown as a current limiter.

Never power a motor or servo from an ESP32 GPIO. Do not assume the ESP32's 3V3/USB rail
can supply the servo. Size its regulator for stall transients at its specified voltage.
Connect grounds without routing motor current through the ESP32; verify polarity and
prevent USB/external supply backfeeding. Follow the carrier's bypass capacitor and
motor noise suppression guidance. STBY must stay low while the ESP32 is off, resetting
or booting; verify/remove any carrier pull-up that defeats that requirement. Firmware
cannot control pins before boot. A brownout/reset must not energize the bridge.

## Configuration and compile-only validation

The safe default remains:

```cpp
#define SIMULATION_MODE 1
#define SENSOR_SIMULATION_MODE 1
#define ENABLE_SELFTEST_ENDPOINT 0
```

After the physical review, manually edit only these existing mode lines in the ignored
`ESP32/Movement/wifi_config.h` (preserve all WiFi passwords and device tokens):

```cpp
#define SIMULATION_MODE 0
#define SENSOR_SIMULATION_MODE 1
#define ENABLE_SELFTEST_ENDPOINT 0
```

Do not modify ESP32 #2's configuration. Hardware code is excluded when SIMULATION_MODE=1.
`ESP32/Movement/hardware_config.h` holds pins, steering calibration and reversal interval.
70°/100°/130° and 500–2400 µs are **legacy, uncalibrated values**, not safe endpoints.
Verify the servo's supported pulse range before attaching/powering it, initially remove
its horn/linkage, and calibrate neutral and conservative endpoints before installing it.
Servo attachment itself can generate pulses/motion, even before the first command;
software cannot guarantee motion-free servo power-up. STOP centers an attached servo
and continues holding it; it does not disconnect servo power. Neutral must be mechanically
safe. If that cannot be established, leave servo power disconnected.

Use ESP32 Arduino Core 3.x, ArduinoJson 7 and ESP32Servo. The current mapping is restricted
to classic ESP32, not C3/S3 boards. Servo timer 0 and motor LEDC channel 2/timer 1 are
separate. The [Core 3 LEDC API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/ledc.html)
reports attachment/write failures; either actuator initialization failure prevents drive.
A PWM write failure latches drive unavailable until reset. Resolve the cause before reset.

From repository root, with the correct board FQBN and CLI on PATH:

```bash
scripts/test-firmware.sh
ARDUINO_CLI=arduino-cli ESP32_FQBN=esp32:esp32:esp32 scripts/compile-firmware.sh
```

This script compiles temporary placeholder credentials in simulation and hardware modes,
checks simulation objects for physical I/O references, and never uploads. Its temporary
artifacts are not deployment builds. Confirm your board identity independently.

## Upload and observe — only after the physical review and explicit authorization

Keep actuator supplies disconnected during upload and initial USB boot. Identify the
movement board's serial port so the sensor board cannot be overwritten. Use a fresh build:

```bash
export FQBN=esp32:esp32:esp32  # only for the confirmed matching classic board
export PORT=/dev/serial/by-id/REPLACE_WITH_IDENTIFIED_MOVEMENT_BOARD
arduino-cli compile --fqbn "$FQBN" --build-path /tmp/plant-real-reviewed ESP32/Movement
arduino-cli upload --fqbn "$FQBN" --port "$PORT" --input-dir /tmp/plant-real-reviewed ESP32/Movement
arduino-cli monitor --port "$PORT" --config baudrate=115200
```

Observe the hardware banner and initialization status. Verify authenticated `GET /status`
using the existing private X-Device-Token without logging/sharing it. Expect `mode=hardware`,
`simulated=false`, `hardwareOutputEnabled=true` (compiled capability, not proof of readiness),
`actuatorsReady=true`, `servoAttached=true`, `pwmAttached=true`, `lastPwmWriteOk=true`,
`standbyPin=0`, `pwmDuty=0`, `speed=0`, `commandedMoving=false`, `controlActive=false`.
These are software diagnostics, not measured shaft motion or servo position. Verify STBY
low and correct 50 Hz servo / 5 kHz motor waveforms with external instruments where available.

## Staged physical checks — manual, attended, after authorization

1. With motor VM disconnected, verify servo alone at its approved voltage, horn initially
   removed. Establish neutral, reinstall linkage with power off, then cautiously test
   LEFT/RIGHT/CENTER through authenticated sessions. Check clearance, binding, current
   and actual left/right orientation. Never force against a stop. LEFT/RIGHT/CENTER stop
   propulsion and only command steering. STOP must center safely.
2. Secure the robot with drive wheels clear of the ground, keep people clear and the
   physical disconnect in reach. Connect the reviewed motor circuit. Start at a small
   reviewed duty (for example 30/255 only if suitable for this motor), short pulses and
   immediate STOP. Do not leave a stalled motor powered. The existing keyboard sends
   150/255, so **do not use W/S for the first low-duty test**. Use a reviewed manual API
   client through authenticated Spring `POST /movement/session` and `POST /movement`,
   with CSRF and increasing sequence; see [protocol](CONTROL_PROTOCOL.md). The device
   direct API additionally needs its token and fresh device-relative deadlines. Do not
   reuse an expired envelope or automate a physical sweep.
3. Confirm FORWARD polarity at low duty. If wrong, disconnect all power before swapping
   motor terminals. Test BACKWARD only after the shaft has visibly stopped. An opposite
   direction while powered immediately stops and returns 409, invalidating the session.
   No reverse is queued. Release keys, wait for physical rest and at least the configured
   500 ms minimum, then intentionally press again/acquire a new session. The interval
   also applies across STOP/new sessions. Measure coast-down under worst-case load and
   increase the interval if needed; without speed feedback it cannot prove rest.
4. Check STOP from each state: STBY goes low before PWM/direction changes; motor coasts
   (standby is high impedance, **not a mechanical brake**), steering centers if initialized.
   Confirm stale/higher-sequence commands in the stopped session cannot restart it.
5. Send one low-duty command and cease heartbeats. Observe STOP after the existing
   1500 ms watchdog, allowing loop/network scheduling latency. Test WiFi loss separately,
   with the disconnect ready. Confirm standby low, session invalidated, reconnect without
   restart and fresh intentional acquisition required. Test reset/power cycle only in
   this secured setup: no propulsion should resume. HTTP handling is synchronous; this
   software watchdog is not a certified hard real-time emergency stop.
6. Only after these pass, verify normal keyboard release/focus loss/emergency STOP at a
   reviewed speed. Monitor current, temperature, supply sag and steering clearance.
   Record component identities, configuration, measurements and outcomes before ground tests.

Do not run automated device/browser movement suites against hardware mode. Their simulation
checks are intentional. Disconnect immediately on unexpected movement, noise, binding,
heating, unstable power or an initialization fault. Do not re-enable by repeatedly resetting.

## Restore simulation

Disconnect actuator power first. Set the three local flags back to 1/1/0 as shown above,
compile a **fresh** simulation artifact and upload to the identified movement board:

```bash
arduino-cli compile --fqbn "$FQBN" --build-path /tmp/plant-restored-simulation ESP32/Movement
arduino-cli upload --fqbn "$FQBN" --port "$PORT" --input-dir /tmp/plant-restored-simulation ESP32/Movement
```

Confirm the simulation banner and `/status`: `mode=simulation`, `hardwareOutputEnabled=false`,
`simulated=true`, duty zero. Leave actuator supplies disconnected until faults are resolved.
Editing a header alone does not change firmware already running on the board.

Keep `MOVEMENT_ESP32_URL` aimed at ESP32 #1 and `ESP32_URL` at the independently identified
sensor ESP32 #2. The movement board's synthetic `/capture` does not replace the sensor
board. No sensor firmware, model, training, prediction service or database change is needed.

## Software validation record — 2026-10-19

- Host C++ production actuator/safety functions: simulation has no output writes; hardware
  mocks cover direction, duty clamping, disable-before-write ordering, reversal rejection,
  STOP across reversal, millis rollover, servo limits, PWM attach/write failure, servo
  attachment failure, watchdog expiry, disconnect/reconnect and no stale restart.
- Command-gate tests: sequences, deadlines, expiry, rollover and STOP invalidation passed.
- Arduino compile-only: `esp32:esp32:esp32`, Core **3.3.11**, ESP32Servo **3.2.1**,
  ArduinoJson **7.4.3**; both simulation sketches, movement hardware branch and unchanged
  real-sensor branch passed. Simulation sketch-object checks found no physical I/O calls.
  This FQBN is a compile target, not confirmation of the physical board identity.
- Frontend: all **16** controller tests, TypeScript check and production build passed.
- Java: **35** tests passed, none skipped, with isolated PostgreSQL and local HTTP mocks;
  includes authentication/CSRF and device-service regression checks.
- Python: **3** unchanged ML tests passed in an isolated existing application image with
  read-only source, after the host Python was found to lack its ML dependencies.
- Software simulator HTTP conformance passed: unauthorized/invalid commands, command
  envelopes, STOP, sequence/deadline rejection, watchdog and synthetic captures.
- Isolated Docker smoke and browser E2E passed, including login, keyboard races, priority
  STOP, blur, network-error behavior, sensor capture, real ML prediction and persistence.
  Browser testing used separate movement and sensor software simulator instances. The
  temporary harness required SERVER_ADDRESS=0.0.0.0 inside its container, with host ports
  restricted to loopback. No deployed configuration was changed.

Initial Java/socket tests were blocked by the sandbox and passed when rerun with the
required local socket access. No automated test accessed an actuator-enabled device.
Physical wiring, supply transients, actual radio-loss stop latency, motor/servo motion,
mechanical endpoints, coast time and reset behavior on an assembled robot remain untested.
