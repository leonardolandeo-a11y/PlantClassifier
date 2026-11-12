# Disposable full-stack browser runner; never reads private env files.
import os, secrets, subprocess, time, urllib.request, urllib.error, http.cookiejar, json, tempfile
from pathlib import Path
suffix=secrets.token_hex(4)
db='plant-browser-db-'+suffix
app='plant-browser-app-'+suffix
broker='plant-browser-mqtt-'+suffix
mqtt_mode=os.environ.get('PLANT_BROWSER_TRANSPORT') == 'mqtt'
bridge=None
work=tempfile.TemporaryDirectory(prefix='plant-browser-')
env=dict(os.environ,POSTGRES_USER='plant_test',POSTGRES_DB='plant_test',POSTGRES_PASSWORD=secrets.token_hex(24),DEVICE_TOKEN=secrets.token_hex(32))
env.update(SPRING_DATASOURCE_USERNAME=env['POSTGRES_USER'],SPRING_DATASOURCE_PASSWORD=env['POSTGRES_PASSWORD'])
def run(*args):
    return subprocess.run(args,env=env,check=True,capture_output=True,text=True).stdout.strip()
try:
    run('docker','run','--rm','-d','--name',db,'--tmpfs','/var/lib/postgresql/data','-p','127.0.0.1::8080','-p','127.0.0.1::18080','-p','127.0.0.1::18081','-p','127.0.0.1::1883','-e','POSTGRES_USER','-e','POSTGRES_DB','-e','POSTGRES_PASSWORD','postgres:17-alpine')
    for _ in range(30):
        try:
            run('docker','exec',db,'pg_isready','-U','plant_test','-d','plant_test');break
        except subprocess.CalledProcessError:time.sleep(1)
    else:raise RuntimeError("Disposable PostgreSQL did not become ready")
    transport=[]
    if mqtt_mode:
        config=Path(work.name)/'mosquitto.conf'
        config.write_text('listener 1883\nallow_anonymous true\npersistence false\nqueue_qos0_messages false\n')
        os.chmod(work.name,0o755)
        run('docker','run','-d','--name',broker,'--network','container:'+db,'-v',str(config)+':/mosquitto/config/mosquitto.conf:ro','eclipse-mosquitto:2.0.22')
        transport=['-e','DEVICE_TRANSPORT=mqtt','-e','MQTT_URL=tcp://127.0.0.1:1883','-e','MQTT_PASSWORD=isolated-test-only']
    run('docker','run','--rm','-d','--name',app,'--network','container:'+db,
        '-e','SPRING_DATASOURCE_URL=jdbc:postgresql://127.0.0.1:5432/plant_test',
        '-e','SPRING_DATASOURCE_USERNAME','-e','SPRING_DATASOURCE_PASSWORD','-e','DEVICE_TOKEN',
        '-e','SERVER_ADDRESS=0.0.0.0','-e','ESP32_URL=http://127.0.0.1:18081','-e','MOVEMENT_ESP32_URL=http://127.0.0.1:18080',
        *transport,'-e','ML_WORKING_DIRECTORY=/app/MLClassification','-e','ML_PYTHON_PATH=/opt/venv/bin/python3',os.environ.get('PLANT_TEST_IMAGE','plantclassifier:reliability'))
    run('docker','cp','scripts/esp32-simulator.py',app+':/tmp/simulator.py')
    for role,port in [('movement','18080'),('sensor','18081')]:
        run('docker','exec','-d',app,'python','/tmp/simulator.py','--host','0.0.0.0','--port',port,'--role',role)
    bindings=json.loads(run('docker','inspect','--format','{{json .NetworkSettings.Ports}}',db))
    assert all(v[0]['HostIp']=='127.0.0.1' for v in bindings.values() if v)
    base='http://'+run('docker','port',db,'8080/tcp')
    device='http://'+run('docker','port',db,'18080/tcp')
    for _ in range(90):
        try:
            with urllib.request.urlopen(base+'/',timeout=2) as r:assert r.status==200
            break
        except (urllib.error.URLError,TimeoutError,ConnectionError):time.sleep(1)
    else:raise RuntimeError('App did not start')
    if mqtt_mode:
        env.update(PLANT_TEST_BROKER=broker,MQTT_SIMULATOR_URL='mqtt://'+run('docker','port',db,'1883/tcp'),PLANT_DEVICE_URL=device,PLANT_SENSOR_URL='http://'+run('docker','port',db,'18081/tcp'))
        bridge=subprocess.Popen([env.get('DIAGNOSTIC_PYTHON','python3'),'scripts/mqtt-simulator-bridge.py'],env=env)
        time.sleep(1)
        if bridge.poll() is not None: raise RuntimeError('MQTT simulation bridge failed')
    client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    with client.open(base+'/csrf') as r:csrf=json.load(r)['token']
    for path in ['/login','/logout']:
        try:client.open(base+path);raise AssertionError(path+' still available')
        except urllib.error.HTTPError as e:assert e.code==404
    req=urllib.request.Request(base+'/logout',data=b'',headers={'X-CSRF-TOKEN':csrf})
    try:client.open(req);raise AssertionError('logout still available')
    except urllib.error.HTTPError as e:assert e.code==404
    for path in ['/movement','/movement/session','/sensors/capture']:
        try:client.open(urllib.request.Request(base+path,data=b'{}',headers={'Content-Type':'application/json'}));raise AssertionError('CSRF missing')
        except urllib.error.HTTPError as e:assert e.code==403
    print('PASS HTTP: direct dashboard, removed login/logout, all mutations reject missing CSRF, loopback publication',flush=True)
    env.update(PLANT_BASE_URL=base,PLANT_DEVICE_URL=device,CHROME_PATH=env.get('CHROME_PATH',''))
    subprocess.run(['node','scripts/benchmark-movement.mjs'] if env.get('PLANT_BENCHMARK_OUTPUT') else ['npm','run','test:e2e'],env=env,check=True,timeout=600)
    if env.get('PLANT_BENCHMARK_OUTPUT'):
        subprocess.run(['./mvnw','-B','-Dtest=MovementLatencyTest','test'],env=env,check=True,timeout=180)
    if not env.get('PLANT_BENCHMARK_OUTPUT'):
        subprocess.run(['node','scripts/test-ui-redesign.mjs'],env=dict(env,PLANT_UI_URL=base),check=True,timeout=120)
    count=run('docker','exec',db,'psql','-U','plant_test','-d','plant_test','-Atc','SELECT count(*) FROM sensor_data;')
    print('Persisted PostgreSQL rows:',count,flush=True)
    if not env.get('PLANT_BENCHMARK_OUTPUT'):
        with urllib.request.urlopen(base+'/sensors',timeout=3) as response: saved=json.load(response)
        run('docker','restart',app)
        for role,port in [('movement','18080'),('sensor','18081')]:
            run('docker','exec','-d',app,'python','/tmp/simulator.py','--host','0.0.0.0','--port',port,'--role',role)
        for _ in range(60):
            try:
                with urllib.request.urlopen(base+'/sensors',timeout=2) as response: recovered=json.load(response)
                assert recovered['id']==saved['id'] and recovered['prediction']==saved['prediction']
                break
            except (urllib.error.URLError,TimeoutError,ConnectionError):time.sleep(1)
        else:raise RuntimeError('Backend/database did not recover after restart')
        with urllib.request.urlopen(urllib.request.Request(device+'/status',headers={'X-Device-Token':env['DEVICE_TOKEN']}),timeout=3) as response: state=json.load(response)
        assert state['command']=='STOP' and state['controlActive'] is False
        print('PASS backend restart: persisted capture survives; simulated actuators remain stopped',flush=True)
except subprocess.CalledProcessError as e:
    print(e.stderr or 'Child process failed',flush=True)
    raise SystemExit(1)
finally:
    if bridge is not None:
        bridge.terminate(); bridge.wait(timeout=5)
    for container in [app,broker,db]:subprocess.run(['docker','rm','-f',container],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    work.cleanup()
    print('Disposable containers stopped; tmpfs database discarded.',flush=True)
