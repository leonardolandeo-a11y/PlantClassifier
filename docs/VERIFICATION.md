> Historical reference: firmware roles and sensor configuration were superseded by
> [DUAL_ESP32_SETUP.md](DUAL_ESP32_SETUP.md). Do not use the old shared-device or
> sensor-simulation/calibration instructions below for the current sensor firmware.

# Final implementation verification — 2026-10-18

Software implementation and integration validation completed in the existing `plantclassifier-lab` environment. **Physical ESP32 validation is not complete.** Unrestricted Arduino CLI discovery returned `detected_ports: []`; no `/dev/ttyUSB*` or `/dev/ttyACM*` device was visible. Authenticated, read-only `/status` checks against the two device URLs configured in `.env.lab` failed to connect. No firmware was uploaded and no actual serial output was captured.

## Tests actually executed and passed

| Check | Actual result | Evidence retained locally |
|---|---|---|
| Java 21 `./mvnw -B verify` | Passed; initial run skipped the two opt-in PostgreSQL tests | `/tmp/plant-final-maven.log` |
| Full Maven verification with disposable PostgreSQL: `scripts/test-postgres.sh -B verify` | **35 tests, 0 failures, 0 errors, 0 skipped** | `/tmp/plant-final-full-verify.log` |
| Standalone PostgreSQL migrations | 2 passed: fresh schema and preservation of legacy rows/sequence | `/tmp/plant-final-postgres.log` |
| `npm run typecheck` | Passed | Terminal execution |
| `npm test` | **6 tests passed** | Terminal execution |
| `npm run build` | TypeScript and Tailwind passed; tracked assets regenerated | Terminal execution |
| `scripts/test-firmware.sh` | C++ gate tests, matching shared headers, rejection of simulation plus physical self-test | Terminal execution |
| ESP32 simulation compilation | Both sketches compiled for `esp32:esp32:esp32`, core **3.3.11** | `/tmp/plant-final-firmware.log` |
| Simulation output safety | Compiled sketch objects have no GPIO/PWM/servo/ADC/DHT I/O references | Same firmware log |
| Future hardware branches | Movement hardware and PlantClassifier real-sensor branches compile; never flashed | Same firmware log |
| Software ESP32 HTTP protocol | Tokens, status, six commands, repeats, invalid sequences, deadlines, STOP, watchdog, synthetic ranges passed | `/tmp/plant-final-simulator.log` |
| Lab device conformance | Passed against the running authenticated simulator, executed independently | `/tmp/plant-final-lab-device.log` |
| Compose config/build/start | Base and both simulation overlays validated; lab rebuilt and started without deleting volumes | `/tmp/plant-final-docker.log`, `/tmp/plant-final-simulation-start.log`, `/tmp/plant-final-split-start.log` |
| Actual lab `/login` | **200, text/html**, dark form with CSRF field | Container HTTP check and browser tests |
| Browser, one device origin | Real Chrome → Spring → simulator → PostgreSQL → actual Python/model passed | `/tmp/plant-final-browser.log` |
| Browser, two device origins | Same workflow passed with independent movement and sensor simulators | `/tmp/plant-final-browser-split.log` |
| Disposable Docker HTTP E2E | Passed with isolated app/database and protocol-enforcing simulator | `/tmp/plant-final-smoke.log` |
| Python ML pipeline | **3 unit tests passed** in the built image; real prediction also used in both browser runs | Docker test output and capture results |
| UI visual inspection | Logged-out dashboard and dark login screenshots inspected | `/tmp/plant-final-screenshots/` |
| Source credential guard and whitespace | Passed | `python3 scripts/check-secrets.py`, `git diff --check` |

The first observed lab capture persisted pH **6.5**, temperature **25**, humidity **60**, `simulated=true`, `prediction_status=SUCCEEDED`, and prediction **maíz**. The second browser run used distinct device origins, and its capture appeared in the independent sensor simulator log. Test captures remain in the lab database as labeled synthetic rows.

The browser checks cover invalid and valid login, dashboard redirect, authentication state, HttpOnly/SameSite cookies, missing-CSRF rejection, W/S/A/D mapping, last-key priority, key release, STOP, idle expiry, editable-field safety, capture loading state, actual prediction and persisted reload, error display and logout. Successful paths use real services. Two additional error-display checks deliberately intercept a request and return 502/504; they are UI tests, not evidence of real device/network faults.

## Failures encountered, corrected or rerun

- The host's default Java is 26. Its first compile did not generate Lombok accessors. Running with the project's required Java 21 fixed compilation. The final command exports `JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64`.
- The new invalid-login test exposed that an empty `?error` parameter could be represented as null. The login controller now checks parameter presence and the error message is tested in MockMvc and Chrome.
- Sandbox restrictions initially blocked local HTTP sockets, Docker access, npm and Arduino CLI downloads/discovery. Necessary commands were rerun with permitted access. No blocked check was reported as a pass.
- A device conformance run overlapped the browser test, which legitimately acquired a replacement control session. Its idle-expiry assertion failed. Running the test alone passed; tests sharing a movement device must run sequentially.
- Idle-expiry messaging could be overwritten by STOP acknowledgement, and request cleanup could re-enable a signed-out button. Both UI behaviors were corrected and the frontend and browser tests rerun.

**No unresolved failure remains in the final executed software checks.** This does not certify physical hardware behavior.

## Security and data preservation

- Explicit dark `GET /login`; Spring Security handles `POST /login`, validates configured credentials and rotates the session. Login is not bypassed. The explicit form follows [Spring Security's custom form-login contract](https://docs.spring.io/spring-security/reference/servlet/authentication/passwords/form.html) and no longer relies on default-page generation alongside the custom API authentication entry point.
- Session authentication, OPERATOR authorization, CSRF on mutations/login/logout, structured 401/403 errors, BCrypt, HttpOnly and SameSite=Strict cookies preserved. Secure cookies remain configurable for HTTPS; the existing loopback HTTP lab uses its appropriate non-Secure configuration.
- Device tokens remain server-side and are transmitted as `X-Device-Token`; no token or password is embedded in frontend output. Session IDs, increasing sequences, device-relative deadlines, STOP invalidation and watchdog remain intact.
- Logout attempts an owner-bound STOP and invalidates the session. Firmware watchdog remains the fallback if communication fails.
- Simulation hardware branches are compiled out. Synthetic readings are labeled in JSON, logs, database metadata and dashboard.
- Confirmed volume: `plantclassifier-lab_plantclassifier_postgres_data`, separate from `plantclassifier_plantclassifier_postgres_data`. No user database volume was deleted. `.env` and `.env.lab` were not modified. Only task-created disposable test containers and the temporary split sensor simulator were removed.

## Final lab state

The app and PostgreSQL run under `plantclassifier-lab`, with the optional single software ESP32 overlay. Dashboard: <http://127.0.0.1:18080>; device simulator: loopback port **18081**; PostgreSQL host port **55433**. Keep the simulation overlay when restarting this software demo. Starting only the base file restores the hardware URLs from `.env.lab`.

The configured historical device URLs were not treated as current verified ESP32 addresses. Read-only checks failed, and no movement request was sent to those addresses during validation.

## Remaining physical checklist

- [ ] Connect and unambiguously identify the USB ESP32, its board model and serial port.
- [ ] Populate ignored local firmware configuration privately; verify simulation flags and matching token.
- [ ] Compile/upload the actual local simulation build to the identified target.
- [ ] Observe the simulation banner, real Wi-Fi connection and actual DHCP IP at 115200 baud.
- [ ] Run authenticated `/status`, `/capture`, `/control-session` and `/movement` tests against that verified board.
- [ ] Run browser commands through Spring and correlate with actual serial output.
- [ ] Test real Wi-Fi loss/reconnect and watchdog timing; confirm reacquisition is required.
- [ ] Keep actuators disconnected. Physical motor/servo operation and calibrated sensor validation are future hardware work, not prerequisites for the simulation demo.

The exact Ubuntu, USB, Serial Monitor, one-board, two-board and repeatable test commands are in [USB_SIMULATION.md](USB_SIMULATION.md). Remote GitHub Actions execution was not performed in this session; local results do not imply a remote CI pass.
