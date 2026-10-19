> Historical reference: firmware roles and sensor configuration were superseded by
> [DUAL_ESP32_SETUP.md](DUAL_ESP32_SETUP.md). Do not use the old shared-device or
> sensor-simulation/calibration instructions below for the current sensor firmware.

# Final integration changes — 2026-10-18

| Files | Purpose |
|---|---|
| `src/main/java/com/codewithmosh/plantclassifier/config/SecurityConfig.java` | Explicit login page, protected native login/logout, owner STOP on logout, no saved API request cache. |
| `src/main/java/com/codewithmosh/plantclassifier/controller/LoginController.java` (new) | Render the dark native form with an escaped, session-bound CSRF token and generic login failure. |
| `src/main/java/com/codewithmosh/plantclassifier/controller/SessionController.java` | Authentication status for the dashboard. |
| `src/main/java/com/codewithmosh/plantclassifier/service/MovementService.java` | Best-effort owner-bound STOP when logging out. |
| `src/main/resources/templates/login.html` (new) | Accessible dark login form. |
| `src/main/resources/static/index.html` | Sign-in state and sign-out action. |
| `frontend/scripts.ts` | Authentication-aware buttons, CSRF logout, correct cleanup after unauthorized responses. |
| `frontend/control.ts` | Visible idle expiry, zero motor speed for steering, expiry acknowledgement messaging. |
| `frontend/input.css` | Login styling and template class scanning. |
| `src/main/resources/static/js/scripts.js`, `src/main/resources/static/js/control.js`, `src/main/resources/static/css/output.css` | Regenerated production assets. |
| `frontend/control.test.mjs` | Six control tests including key mapping/speed and idle expiry. |
| `src/test/java/com/codewithmosh/plantclassifier/ApiSecurityTest.java` | GET login, form/error flow, session rotation/logout, CSRF, public/protected endpoint integration tests. |
| `src/test/java/com/codewithmosh/plantclassifier/MovementServiceTest.java` | Logout owner isolation and STOP invalidation test. |
| `ESP32/Movement/Movement.ino` | Default safe simulation, compile-excluded actuator access, synthetic capture, explicit status and serial output, stopped hardware standby safety. |
| `ESP32/PlantClassifier/PlantClassifier.ino` | Sensor simulation with no ADC/DHT reads, clearly labeled synthetic capture, movement safety status, bounded Wi-Fi startup/reconnect, calibrated real-sensor branch. |
| Both `ESP32/{Movement,PlantClassifier}/simulation_config.h` (new) | Safe defaults, legal flag checks, rejection of physical self-test in simulation, legacy sensor-flag compatibility. |
| Both `ESP32/{Movement,PlantClassifier}/simulated_capture.h` (new) | Authenticated fixed synthetic fixture and serial provenance. |
| Both `ESP32/{Movement,PlantClassifier}/control_protocol.h` | Log acquisition without exposing tokens or session IDs. |
| Both `ESP32/{Movement,PlantClassifier}/wifi_config.example.h` | Explicit safe demo flags and real-sensor calibration guidance; placeholders only. |
| `Dockerfile` | Include login template in Tailwind scanning during image build. |
| `docker-compose.yaml` | Application healthcheck. |
| `docker-compose.simulation.yaml` (new) | Optional authenticated single-device simulator, loopback port, environment-file preservation. |
| `docker-compose.simulation-split.yaml` (new) | Optional independent sensor simulator for two-origin integration tests. |
| `scripts/esp32-simulator.py` (new) | Hardware-free authenticated HTTP device, sessions, deadlines, ordering, STOP and watchdog. |
| `scripts/test-device.py` (new) | Reusable HTTP conformance checks; refuses movement unless device advertises safe simulation. |
| `scripts/test-simulator.py` (new) | Disposable local simulator plus real HTTP conformance tests. |
| `scripts/compile-firmware.sh` (new) | Compile both simulation sketches, inspect object symbols, compile future hardware branches; never flash. |
| `scripts/test-firmware.sh` | Shared-header consistency and prohibited configuration check. |
| `scripts/browser-e2e.mjs` (new) | Actual Chrome dashboard integration and error-display tests. |
| `scripts/with-lab-env.mjs` (new) | Load dotenv credentials as data without printing or executing them. |
| `scripts/smoke-docker.py` | Use the enforcing simulator and test all movement commands plus actual login form/ML/persistence. |
| `scripts/test-postgres.sh` | Optional Maven arguments to run all tests against disposable PostgreSQL. |
| `package.json`, `package-lock.json` | Playwright development dependency and `test:e2e` entry point. |
| `.github/workflows/verify.yml` | Run software-device protocol tests in CI. |
| `README.md`, `docs/SECURITY.md`, `docs/CONTROL_PROTOCOL.md` | Updated login, modes and protocol guidance. |
| `docs/USB_SIMULATION.md` (new) | Complete Ubuntu/USB/Serial Monitor procedure, both architectures and exact test commands. |
| `docs/VERIFICATION.md` | Actual current results, resolved failures, final lab state and outstanding physical checklist. |
| `docs/CHANGED_FILES.md` | This inventory; prior implementation inventory retained below. |

## Prior implementation inventory

# Changed files

Complete implementation manifest relative to the reviewed main branch. A = added; M = modified; D = removed. Dataset and deployed model are unchanged.

| Status | File |
|---|---|
| M | `.dockerignore` |
| M | `.env.example` |
| A | `.github/workflows/verify.yml` |
| M | `.gitignore` |
| M | `Dockerfile` |
| M | `ESP32/Movement/Movement.ino` |
| A | `ESP32/Movement/command_gate.h` |
| A | `ESP32/Movement/control_protocol.h` |
| A | `ESP32/Movement/wifi_config.example.h` |
| M | `ESP32/PlantClassifier/PlantClassifier.ino` |
| A | `ESP32/PlantClassifier/command_gate.h` |
| A | `ESP32/PlantClassifier/control_protocol.h` |
| A | `ESP32/PlantClassifier/wifi_config.example.h` |
| A | `ESP32/tests/command_gate_test.cpp` |
| D | `MLClassification/__pycache__/ConnectionServer.cpython-314.pyc` |
| D | `MLClassification/__pycache__/modelSKL.cpython-314.pyc` |
| A | `MLClassification/compression-report.json` |
| A | `MLClassification/evaluation.json` |
| A | `MLClassification/features.py` |
| M | `MLClassification/predict.py` |
| M | `MLClassification/requirements.txt` |
| A | `MLClassification/test_pipeline.py` |
| M | `MLClassification/train.py` |
| A | `README.md` |
| M | `docker-compose.yaml` |
| A | `docs/CHANGED_FILES.md` |
| A | `docs/CONTROL_PROTOCOL.md` |
| A | `docs/MIGRATIONS.md` |
| A | `docs/SECURITY.md` |
| A | `docs/VERIFICATION.md` |
| A | `frontend/control.test.mjs` |
| A | `frontend/control.ts` |
| M | `frontend/input.css` |
| M | `frontend/scripts.ts` |
| D | `git` |
| M | `package.json` |
| M | `pom.xml` |
| A | `scripts/check-secrets.py` |
| A | `scripts/smoke-docker.py` |
| A | `scripts/test-firmware.sh` |
| A | `scripts/test-postgres.sh` |
| A | `scripts/watch.cjs` |
| M | `src/main/java/com/codewithmosh/plantclassifier/GlobalExceptionHandler.java` |
| A | `src/main/java/com/codewithmosh/plantclassifier/config/DeviceClients.java` |
| A | `src/main/java/com/codewithmosh/plantclassifier/config/SecurityConfig.java` |
| A | `src/main/java/com/codewithmosh/plantclassifier/config/StartupDiagnostics.java` |
| M | `src/main/java/com/codewithmosh/plantclassifier/controller/MovementController.java` |
| M | `src/main/java/com/codewithmosh/plantclassifier/controller/SensorDataController.java` |
| A | `src/main/java/com/codewithmosh/plantclassifier/controller/SessionController.java` |
| A | `src/main/java/com/codewithmosh/plantclassifier/dto/CaptureResponse.java` |
| A | `src/main/java/com/codewithmosh/plantclassifier/dto/MovementAck.java` |
| M | `src/main/java/com/codewithmosh/plantclassifier/dto/MovementRequestDTO.java` |
| A | `src/main/java/com/codewithmosh/plantclassifier/dto/SensorReading.java` |
| D | `src/main/java/com/codewithmosh/plantclassifier/exception/MLExecutionException.java` |
| A | `src/main/java/com/codewithmosh/plantclassifier/exception/SystemFailure.java` |
| M | `src/main/java/com/codewithmosh/plantclassifier/model/SensorData.java` |
| M | `src/main/java/com/codewithmosh/plantclassifier/repository/SensorDataRepository.java` |
| A | `src/main/java/com/codewithmosh/plantclassifier/service/DeviceResponse.java` |
| M | `src/main/java/com/codewithmosh/plantclassifier/service/MLService.java` |
| M | `src/main/java/com/codewithmosh/plantclassifier/service/MovementService.java` |
| M | `src/main/java/com/codewithmosh/plantclassifier/service/SensorDataService.java` |
| M | `src/main/resources/application.properties` |
| A | `src/main/resources/db/migration/V1__initial_sensor_schema.sql` |
| A | `src/main/resources/db/migration/V2__measurement_metadata.sql` |
| M | `src/main/resources/static/css/output.css` |
| M | `src/main/resources/static/index.html` |
| A | `src/main/resources/static/js/control.js` |
| M | `src/main/resources/static/js/scripts.js` |
| A | `src/test/java/com/codewithmosh/plantclassifier/ApiSecurityTest.java` |
| A | `src/test/java/com/codewithmosh/plantclassifier/DeviceHttpTest.java` |
| M | `src/test/java/com/codewithmosh/plantclassifier/MovementRequestDTOTest.java` |
| M | `src/test/java/com/codewithmosh/plantclassifier/MovementServiceTest.java` |
| M | `src/test/java/com/codewithmosh/plantclassifier/PlantClassifierApplicationTests.java` |
| A | `src/test/java/com/codewithmosh/plantclassifier/PostgresMigrationTest.java` |
| A | `src/test/java/com/codewithmosh/plantclassifier/SensorDataServiceTest.java` |
| A | `src/test/java/com/codewithmosh/plantclassifier/SensorPersistenceTest.java` |
| A | `src/test/java/com/codewithmosh/plantclassifier/service/MLServiceTest.java` |
| A | `src/test/resources/application-test.properties` |
| A | `src/test/resources/mockito-extensions/org.mockito.plugins.MockMaker` |
| M | `tsconfig.json` |
