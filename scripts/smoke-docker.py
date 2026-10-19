"""End-to-end Docker smoke test with disposable PostgreSQL and a simulated ESP32.
No production configuration, volumes or physical devices are used.
Run after: docker build -t plantclassifier:reliability .
"""
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request


def inside():
    from esp32_simulator import make_server
    server = make_server("127.0.0.1", 18080, os.environ["DEVICE_TOKEN"], "movement")
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    sensor = make_server("127.0.0.1", 18081, os.environ["DEVICE_TOKEN"], "sensor")
    threading.Thread(target=sensor.serve_forever, daemon=True).start()
    cookies = http.cookiejar.CookieJar()
    client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))
    base = "http://127.0.0.1:8080"
    def get(path):
        with client.open(base + path, timeout=40) as response:
            return json.load(response)
    def post(path, data=None, token=None, form=False):
        headers = {"Content-Type": "application/x-www-form-urlencoded" if form else "application/json"}
        if token:
            headers["X-CSRF-TOKEN"] = token
        body = urllib.parse.urlencode(data).encode() if form else json.dumps(data).encode()
        return client.open(urllib.request.Request(base + path, data=body, headers=headers), timeout=40)
    try:
        for _ in range(90):
            try:
                csrf = get("/csrf")["token"]
                break
            except (urllib.error.URLError, ConnectionError):
                time.sleep(1)
        else:
            raise RuntimeError("Application did not start")
        with client.open(base + "/login", timeout=10) as response:
            assert response.status == 200 and b'name="_csrf"' in response.read()
        try:
            post("/movement")
            raise AssertionError("Unauthenticated movement accepted")
        except urllib.error.HTTPError as error:
            assert error.code == 401
        with post("/login", {"username": os.environ["CONTROL_USERNAME"],
                             "password": os.environ["CONTROL_PASSWORD"]}, csrf, form=True) as response:
            assert response.status == 200
        csrf = get("/csrf")["token"]
        with post("/movement/session", token=csrf) as response:
            control = json.load(response)
        for sequence, command in enumerate(["FORWARD", "BACKWARD", "LEFT", "RIGHT", "CENTER", "STOP"], 1):
            with post("/movement", {"command": command, "speed": 150 if command in ("FORWARD", "BACKWARD") else 0,
                                   "sessionId": control["sessionId"], "sequence": sequence}, csrf) as response:
                ack = json.load(response)
                assert ack["status"] == "OK" and ack["simulated"] is True
        with post("/sensors/capture", token=csrf) as response:
            capture = json.load(response)
            assert capture["predictionStatus"] == "SUCCEEDED", capture["predictionStatus"]
            assert capture["capturedAt"] and capture["simulated"] is True
            assert capture["temperature"] == 25 and capture["prediction"]
        assert capture["phSource"] == "software"
        latest = get("/sensors")
        assert latest["id"] == capture["id"] and latest["prediction"] == capture["prediction"]
        print("Docker E2E passed: login/CSRF, unauthorized rejection, device acknowledgement, real ML prediction, PostgreSQL persistence and latest reading")
    finally:
        sensor.simulator_stop.set()
        sensor.shutdown()
        sensor.server_close()
        server.simulator_stop.set()
        server.shutdown()
        server.server_close()


def outside():
    suffix = secrets.token_hex(4)
    database, application = "plant-smoke-db-" + suffix, "plant-smoke-app-" + suffix
    env = dict(os.environ, POSTGRES_USER="plant_test", POSTGRES_DB="plant_test",
               POSTGRES_PASSWORD=secrets.token_hex(24), CONTROL_USERNAME="smoke-operator",
               CONTROL_PASSWORD=secrets.token_hex(24), DEVICE_TOKEN=secrets.token_hex(32))
    env.update(SPRING_DATASOURCE_USERNAME=env["POSTGRES_USER"], SPRING_DATASOURCE_PASSWORD=env["POSTGRES_PASSWORD"])
    def run(*args):
        return subprocess.run(args, check=True, env=env, capture_output=True, text=True).stdout.strip()
    try:
        run("docker", "run", "--rm", "-d", "--name", database,
            "-e", "POSTGRES_USER", "-e", "POSTGRES_DB", "-e", "POSTGRES_PASSWORD", "postgres:17-alpine")
        for _ in range(30):
            try:
                run("docker", "exec", database, "pg_isready", "-U", "plant_test", "-d", "plant_test")
                break
            except subprocess.CalledProcessError:
                time.sleep(1)
        run("docker", "run", "--rm", "-d", "--name", application, "--network", "container:" + database,
            "-e", "SPRING_DATASOURCE_URL=jdbc:postgresql://127.0.0.1:5432/plant_test",
            "-e", "SPRING_DATASOURCE_USERNAME", "-e", "SPRING_DATASOURCE_PASSWORD",
            "-e", "CONTROL_USERNAME", "-e", "CONTROL_PASSWORD", "-e", "DEVICE_TOKEN",
            "-e", "ESP32_URL=http://127.0.0.1:18081", "-e", "MOVEMENT_ESP32_URL=http://127.0.0.1:18080",
            "-e", "ML_WORKING_DIRECTORY=/app/MLClassification", "-e", "ML_PYTHON_PATH=/opt/venv/bin/python3",
            os.environ.get("PLANT_TEST_IMAGE", "plantclassifier:reliability"))
        run("docker", "cp", str(Path(__file__).resolve()), application + ":/tmp/smoke.py")
        run("docker", "cp", str(Path(__file__).with_name("esp32-simulator.py").resolve()), application + ":/tmp/esp32_simulator.py")
        print(run("docker", "exec", application, "python", "/tmp/smoke.py", "--inside"))
    except subprocess.CalledProcessError as error:
        # Only print test stderr, never the credential environment or container inspect output.
        print(error.stderr, file=sys.stderr)
        raise SystemExit("Docker smoke check failed") from None
    finally:
        for container in [application, database]:
            subprocess.run(["docker", "stop", container], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


if __name__ == "__main__":
    inside() if "--inside" in sys.argv else outside()
