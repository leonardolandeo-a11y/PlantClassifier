#!/usr/bin/env python3
"""Read-only diagnostic contract tests against software endpoints, never hardware."""
import http.server
import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import threading
import time

ROOT=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('diagnose',ROOT/'diagnose-latency.py')
diag=importlib.util.module_from_spec(spec)
spec.loader.exec_module(diag)
assert diag.summary([1,2,3,4,5],6)==dict(attempted=6,received=5,losses=1,p50_ms=3,p95_ms=5,p99_ms=5,max_ms=5)
class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        assert self.path=='/status'
        self.send_response(200); self.end_headers(); self.wfile.write(b'{"status":"online"}')
    def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0), Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
with tempfile.TemporaryDirectory() as work:
    out=str(pathlib.Path(work)/'http.json')
    subprocess.run([sys.executable,str(ROOT/'diagnose-latency.py'),'http','--host','127.0.0.1',
                    '--port',str(server.server_port),'--count','3','--interval','.1','--output',out],
                   env={**os.environ,'DEVICE_TOKEN':'mock-only'},check=True,stdout=subprocess.DEVNULL)
    assert json.load(open(out))['round_trip']['received']==3
server.shutdown()
if 'MQTT_TEST_URL' in os.environ:
    import paho.mqtt.client as mqtt
    from urllib.parse import urlparse
    url=urlparse(os.environ['MQTT_TEST_URL'])
    assert url.hostname=='127.0.0.1'
    client=mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,client_id='mock-diagnostic-device')
    ready=threading.Event()
    def connected(c,*unused): c.subscribe('plant/v1/sensor/command',0); ready.set()
    def message(c,u,msg):
        value=json.loads(msg.payload)
        assert value['method']=='GET' and value['path']=='/status' and value['body']=={}
        c.publish('plant/v1/sensor/ack',json.dumps(dict(id=value['id'],connectionId='a'*32,
                  status=200,body={'status':'online'},receivedMs=10,ackMs=12)),qos=0,retain=False)
    client.on_connect=connected; client.on_message=message
    client.connect(url.hostname,url.port); client.loop_start(); assert ready.wait(2)
    stop=threading.Event()
    def heartbeat():
        while not stop.wait(.05):
            client.publish('plant/v1/sensor/state',json.dumps(dict(online=True,connectionId='a'*32)),qos=0,retain=False)
    thread=threading.Thread(target=heartbeat);thread.start()
    try:
        with tempfile.TemporaryDirectory() as work:
            out=str(pathlib.Path(work)/'mqtt.json')
            subprocess.run([sys.executable,str(ROOT/'diagnose-latency.py'),'mqtt','--host',url.hostname,
                '--port',str(url.port),'--role','sensor','--count','3','--interval','.1','--output',out],
                env={**os.environ,'MQTT_PASSWORD':'mock-only'},check=True,stdout=subprocess.DEVNULL)
            result=json.load(open(out)); assert result['round_trip']['received']==3
            assert result['firmware_queue_and_handler']['p50_ms']==2
    finally:
        stop.set();thread.join();client.disconnect();client.loop_stop()
print('PASS diagnostic percentiles, read-only HTTP' + (' and MQTT' if 'MQTT_TEST_URL' in os.environ else ''))
