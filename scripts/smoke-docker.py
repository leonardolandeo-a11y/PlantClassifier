"""End-to-end Docker smoke test with disposable PostgreSQL and a simulated ESP32.
No production configuration, volumes or physical devices are used.
Run after: docker build -t plantclassifier:reliability .
"""
import http.cookiejar
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
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
    session = "a" * 32
    class Device(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass
        def reply(self, status, data):
            body = json.dumps(data).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)
        def authenticated(self):
            if self.headers.get("X-Device-Token") != os.environ["DEVICE_TOKEN"]:
                self.reply(401, {"error": "Unauthorized"})
                return False
            return True
        def do_GET(self):
            if not self.authenticated():
                return
            if self.path == "/capture":
                self.reply(200, {"temperature": 25, "humidity": 60, "ph": 7, "simulated": True})
            else:
                self.reply(404, {})
        def do_POST(self):
            if not self.authenticated():
                return
            if self.path == "/control-session":
                self.reply(200, {"sessionId": session, "deviceTimeMs": 1000})
            elif self.path == "/movement":
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                assert body["sessionId"] == session and isinstance(body["deadlineMs"], int)
                self.reply(200, {"status": "OK", "command": body["command"], "speed": body["speed"],
                                 "simulated": True, "sessionId": session, "sequence": body["sequence"]})
            else:
                self.reply(404, {})

    server = ThreadingHTTPServer(("127.0.0.1", 18080), Device)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
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
        with post("/movement", {"command": "STOP", "speed": 0, "sessionId": control["sessionId"], "sequence": 1}, csrf) as response:
            ack = json.load(response)
            assert ack["status"] == "OK" and ack["simulated"] is True
        with post("/sensors/capture", token=csrf) as response:
            capture = json.load(response)
            assert capture["predictionStatus"] == "SUCCEEDED", capture["predictionStatus"]
            assert capture["capturedAt"] and capture["simulated"] is True
            assert capture["temperature"] == 25 and capture["prediction"]
        latest = get("/sensors")
        assert latest["id"] == capture["id"] and latest["prediction"] == capture["prediction"]
        print("Docker E2E passed: login/CSRF, unauthorized rejection, device acknowledgement, real ML prediction, PostgreSQL persistence and latest reading")
    finally:
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
            "-e", "ESP32_URL=http://127.0.0.1:18080", "-e", "MOVEMENT_ESP32_URL=http://127.0.0.1:18080",
            "-e", "ML_WORKING_DIRECTORY=/app/MLClassification", "-e", "ML_PYTHON_PATH=/opt/venv/bin/python3",
            os.environ.get("PLANT_TEST_IMAGE", "plantclassifier:reliability"))
        run("docker", "cp", str(Path(__file__).resolve()), application + ":/tmp/smoke.py")
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
