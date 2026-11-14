#!/usr/bin/env python3
"""Real Compose/browser acceptance test; no scenario retries. Only deletes its own resources.
Requires Docker, Python, npm ci and Playwright Chromium. Runs from a clean checkout in CI.
"""
import json
import os
from pathlib import Path
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import subprocess
import tempfile
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
REPORT = Path(os.environ.get('DEMO_REPORT', '/tmp/plant-demo-report')).resolve()
REPORT.mkdir(parents=True, exist_ok=True)
print(f'DEMO_REPORT={REPORT}', flush=True)
(REPORT/'result.txt').write_text('INCOMPLETE: acceptance started; see compose.log and execution.log.\n')
project = 'plant-demo-test-' + uuid.uuid4().hex[:10]
env = {k:v for k,v in os.environ.items() if not k.startswith('COMPOSE_')}
# Hostile ambient transport/addresses must never enter the standalone configuration.
env.update(DEVICE_TRANSPORT='mqtt', MQTT_URL='tcp://must-not-contact:1883', ESP32_URL='http://must-not-contact', MOVEMENT_ESP32_URL='http://must-not-contact')
compose = ['docker','compose','--env-file',os.devnull,'-p',project,'-f',str(ROOT/'docker-compose.demo.yaml')]
def run(args, **kw):
    return subprocess.run(args, cwd=ROOT, env=env, check=True, text=True, **kw)
def output(args):
    return run(args,capture_output=True).stdout.strip()
def url():
    return 'http://' + output(compose+['port','web','8080'])
def latest():
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(url()+'/sensors',timeout=10) as response:
        return json.load(response)
class Fixture(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'occupied-by-demo-test')
    def log_message(self, *_):
        pass

# Optional reuse for local recovery; CI always builds from source.
reuse = os.environ.get('DEMO_REUSE_IMAGE_PREFIX')
if reuse:
    override = REPORT / 'reuse-images.json'
    override.write_text(json.dumps({'services': {name: {'image': f'{reuse}-{name}:latest'}
        for name in ('app', 'simulator', 'sensor-simulator')}}))
    compose += ['-f', str(override)]

listeners=[]
try:
    for port in (18080,18081,18082,55433):
        try:
            listener=ThreadingHTTPServer(('127.0.0.1',port), Fixture)
            threading.Thread(target=listener.serve_forever, daemon=True).start()
            listeners.append(listener)
            print(f'Test fixture occupies {port}',flush=True)
        except OSError:
            # Opt-in only for developer machines with existing services; CI must own fixtures.
            if os.environ.get('DEMO_ALLOW_EXISTING_PORTS') != '1':
                raise
            print(f'Existing service occupies {port}; left untouched',flush=True)
    config=json.loads(output(compose+['config','--format','json']))
    assert config['networks']['default']['internal'] is True
    for name,service in config['services'].items():
        if name != 'web': assert not service.get('ports')
    app=config['services']['app']
    assert app['environment']['DEVICE_TRANSPORT']=='http'
    assert app['environment']['ESP32_URL']=='http://sensor-simulator:8081'
    assert app['environment']['MOVEMENT_ESP32_URL']=='http://simulator:8081'
    assert set(app['networks'])=={'default'}
    assert config['services']['web']['ports'][0]['host_ip']=='127.0.0.1'
    run(compose+['up','-d', '--no-build' if reuse else '--build','--wait','--wait-timeout','180'])
    assert int(url().rsplit(':',1)[1]) not in (18080,18081,18082,55433)
    # Explicit web-port collision fails, then default allocation succeeds; no service is killed.
    with tempfile.TemporaryDirectory() as directory:
        override=Path(directory)/'collision.yaml'
        override.write_text('services:\n  web:\n    ports: !override\n      - "127.0.0.1:18080:8080"\n')
        collision=compose+['-f',str(override)]
        result=subprocess.run(collision+['up','-d','web'],cwd=ROOT,env=env,text=True,capture_output=True)
        assert result.returncode != 0, 'Expected occupied web port to fail'
        assert 'port' in result.stderr.lower() or 'address' in result.stderr.lower(), result.stderr
        (REPORT/'port-conflict.txt').write_text(result.stderr)
    run(compose+['up','-d','--wait','--wait-timeout','180'])
    env.update(PLANT_BASE_URL=url(),DEMO_REPORT=str(REPORT))
    run(['node','scripts/demo-browser.mjs'])
    capture=json.loads((REPORT/'capture.json').read_text())
    assert latest()==capture
    # Java may spawn the worker from any JVM thread, not PID 1's main task.
    runtime=output(compose+['exec','-T','app','python','-c', """
import json
from pathlib import Path
workers=[]
for path in Path('/proc').glob('[0-9]*/cmdline'):
    try:
        args=path.read_bytes().split(bytes([0]))
    except (FileNotFoundError, ProcessLookupError):
        continue
    if b'--worker' in args and any(arg.endswith(b'predict.py') for arg in args):
        workers.append(path.parent.name)
routes=Path('/proc/net/route').read_text()
print(json.dumps({'workers': workers, 'routes': routes}))
"""])
    (REPORT/'runtime.json').write_text(runtime)
    runtime=json.loads(runtime)
    assert not any(line.split()[1]=='00000000' for line in runtime['routes'].splitlines()[1:]), 'Unexpected default route'
    assert runtime['workers'], 'Persistent Python worker not found'
    sql=output(compose+['exec','-T','db','psql','-U','demo','-d','demo','-Atc',f"SELECT prediction FROM sensor_data WHERE id={int(capture['id'])}"])
    assert sql==capture['prediction']
    # Cross-check the model in the actual image, and the running Python worker.
    predicted=output(compose+['exec','-T','app','python','MLClassification/predict.py','25','60','6.5','45'])
    assert capture['prediction'] in predicted
    run(compose+['down'])  # volume intentionally retained across container recreation
    run(compose+['up','-d','--wait','--wait-timeout','180'])
    assert latest()==capture
    for listener in listeners:
        with urllib.request.urlopen(f'http://127.0.0.1:{listener.server_port}',timeout=3) as response:
            assert response.read()==b'occupied-by-demo-test'
    print('PASS occupied ports, web collision, isolated network, PostgreSQL persistence after down/up',flush=True)
    (REPORT/'result.txt').write_text('PASS: acceptance, occupied ports, web collision, dashboard, capture, Python prediction, PostgreSQL down/up persistence, movement STOP and servo HOLD. Expo Go phone: NOT TESTED.\n')
except BaseException as error:
    (REPORT/'result.txt').write_text(f'FAIL: {type(error).__name__}: {error}\n')
    raise
finally:
    logs=subprocess.run(compose+['logs','--no-color'],cwd=ROOT,env=env,text=True,capture_output=True)
    (REPORT/'compose.log').write_text(logs.stdout+logs.stderr)
    run(compose+['down','-v','--remove-orphans'])  # unique disposable test project only
    for listener in listeners:
        listener.shutdown()
        listener.server_close()
