# Verification record

This record distinguishes executed automated checks from physical validation. Final backend run: **30 tests, 0 failures, 0 errors, 0 skipped**, with the disposable PostgreSQL configuration enabled. Hardware results are never inferred from mocks.

## Executed checks

- Maven compilation, unit tests, full Spring context, actual form login/session/CSRF tests, real local HTTP delay/timeout tests, sensor persistence and bounded Python subprocess tests.
- PostgreSQL 17: fresh schema initialization, explicit legacy baseline, preservation of an existing measurement and sequence value. Tests use isolated temporary schemas in an ephemeral container; no user volumes are mounted.
- TypeScript type checking, four keyboard/control state tests, production JS/CSS generation.
- Pure C++ firmware command gate: duplicate/stale sequences, STOP invalidation, deadline expiry, watchdog, epoch invalidation and `millis()` rollover. Both sketch copies are checked for equality.
- Python syntax/imports, deployed-model prediction, three pipeline unit tests, held-out model evaluation repeated with identical metrics/confusion matrix.
- Original-model compression experiment with exact prediction equality on 200 sampled rows. Original model SHA-256 remains `7554a7b1c458d6d1f0306eb3fb6316cbc916b4ff861d04bff0770dd3475d1f73`.
- Compose configuration validation with the example configuration (no secret values printed), Docker image build including Java/frontend tests and real model loading.
- Docker end-to-end smoke passed with a fresh disposable PostgreSQL instance and token-protected fake ESP32: actual login/CSRF, anonymous rejection, STOP acknowledgement, real deployed-model prediction, saved timestamp/provenance and latest-reading query. The script cleans up its own containers.
- Current-source credential guard, manual historical credential review, and `git diff --check`.

## Commands

```bash
# Complete Java suite with disposable PostgreSQL already started on an ephemeral port:
PLANT_TEST_DB_URL=jdbc:postgresql://127.0.0.1:<ephemeral-port>/plant_test \
PLANT_TEST_DB_USER=plant_test PLANT_TEST_DB_PASSWORD=<isolated-test-password> ./mvnw -B clean verify
# Standalone reproducible PostgreSQL check:
scripts/test-postgres.sh
npm run typecheck
npm test
npm run build
scripts/test-firmware.sh
python3 -m py_compile MLClassification/features.py MLClassification/predict.py MLClassification/train.py
/tmp/plant-ml-venv/bin/python -m unittest discover -s MLClassification -p 'test_*.py'
/tmp/plant-ml-venv/bin/python MLClassification/predict.py 25 60 7
/tmp/plant-ml-venv/bin/python MLClassification/train.py --report MLClassification/evaluation.json --candidate /tmp/plant-model-candidate.pkl
/tmp/plant-ml-venv/bin/python MLClassification/train.py --report /tmp/plant-evaluation-repeat.json
python3 scripts/check-secrets.py
docker compose --env-file .env.example config --quiet
docker build -t plantclassifier:reliability .
python3 scripts/smoke-docker.py
git diff --check
```

Python dependencies were installed into a temporary virtual environment. Python 3.14 was used on the host and the image uses Ubuntu Noble Python 3.12. The pinned scikit-learn version declares Python >=3.11. Other pinned numerical libraries require Python >=3.12, so Python 3.12+ is the supported project environment.

## Failures encountered and resolved

- The sandbox denied socket creation in HTTP tests, Docker socket access and dependency downloads. These commands were rerun with the necessary environment approval; no tests were rewritten to pretend a blocked operation passed.
- A real login test exposed a missing BCrypt format identifier, which was corrected. Mock-user tests alone would not have caught this issue.
- The Docker end-to-end test detected chunked outgoing movement JSON without Content-Length. Requests now use an explicit bounded JSON byte body and length, and the real HTTP test checks that header.
- Early MockRestServiceServer tests added expectations after execution; expectation setup was corrected.
- The previous ML timeout and previous unavailable-port movement test were replaced with behavior tests. Current movement tests inspect actual request bodies and acknowledgements.
- Flyway emits an advisory that H2 2.4 is newer than its verified H2 release. The same migrations were separately tested on PostgreSQL 17; H2 is not treated as proof of PostgreSQL compatibility.

## Pending validation and deployment actions

- Compile/upload sketches with the selected ESP32 board and installed Arduino libraries; Arduino CLI is not preinstalled in this environment.
- Test actual Wi-Fi connection/reconnection, request delays, watchdog timing and STOP with hardware.
- Validate TB6612FNG direction reversal, supply/wiring, servo travel and diagnostic mode with wheels raised; no physical movement was measured here.
- Calibrate the pH probe and validate real DHT11 failure handling on connected sensors.
- Review/baseline the actual deployment database after backup; only the known legacy schema was tested in isolation.
- Rotate exposed historical credentials and configure HTTPS/network isolation as described in SECURITY.md.
- Observe the GitHub Actions run after pushing. Local checks do not claim remote CI success.
