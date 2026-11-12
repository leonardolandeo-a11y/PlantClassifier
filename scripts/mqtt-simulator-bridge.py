#!/usr/bin/env python3
"""Bounded MQTT bridge to VERIFIED local HTTP software simulators. Never physical devices."""
import json, os, queue, secrets, threading, time, urllib.request, urllib.error
import paho.mqtt.client as mqtt
from urllib.parse import urlparse
broker = urlparse(os.environ['MQTT_SIMULATOR_URL'])
assert broker.hostname == '127.0.0.1'
token = os.environ['DEVICE_TOKEN']
clients = []
delay_ms=int(os.environ.get('PLANT_MQTT_DELAY_MS','0'))
assert 0 <= delay_ms <= 300, 'Controlled test delay must be 0..300 ms'

for role, variable in [('movement','PLANT_DEVICE_URL'),('sensor','PLANT_SENSOR_URL')]:
    base = os.environ[variable]
    assert urlparse(base).hostname == '127.0.0.1'
    with urllib.request.urlopen(urllib.request.Request(base+'/status',headers={'X-Device-Token':token}),timeout=3) as response:
        state=json.load(response)
    assert state['mode']=='simulation' and state['hardwareOutputEnabled'] is False
    def board(role=role, base=base):
        connection = ''
        network_up = True
        normal, urgent = queue.Queue(4), queue.Queue(1)
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,client_id='simulation-'+role+'-'+secrets.token_hex(4),clean_session=True)
        def connected(client, userdata, flags, reason, properties):
            nonlocal connection
            connection = secrets.token_hex(16)
            client.subscribe([(f'plant/v1/{role}/command',0),(f'plant/v1/{role}/urgent',0)])
        def arrived(client, userdata, message):
            if message.retain or len(message.payload)>2048: return
            try:
                data=json.loads(message.payload)
                if not network_up or data.get('connectionId') != connection: return
                target=urgent if message.topic.endswith('/urgent') else normal
                if target is urgent and data.get('body',{}).get('command') not in ('STOP','HOLD'): return
                target.put_nowait((data,time.monotonic()))
            except (ValueError,queue.Full): pass # Dropped operations expire; no fake ACK.
        def execute(work):
            while True:
                data,received=work.get()
                if work is normal and time.monotonic()-received > .250: continue
                if work is normal and delay_ms: time.sleep(delay_ms/1000)
                if not network_up or data.get('connectionId') != connection: continue
                path=data.get('path')
                allowed={'/status','/control-session','/movement'} if role=='movement' else {'/status','/capture','/servo-session','/servo'}
                if path not in allowed: continue
                payload=json.dumps(data['body']).encode() if data['method']=='POST' else None
                request=urllib.request.Request(base+path,data=payload,method=data['method'],headers={'X-Device-Token':token,'Content-Type':'application/json'})
                try:
                    try: response=urllib.request.urlopen(request,timeout=4)
                    except urllib.error.HTTPError as error: response=error
                    with response:
                        status=response.code; body=json.load(response)
                    client.publish(f'plant/v1/{role}/ack',json.dumps({'id':data['id'],'connectionId':data['connectionId'],'status':status,'body':body}),qos=0,retain=False)
                except (OSError,ValueError): pass
        client.on_connect=connected; client.on_message=arrived
        client.will_set(f'plant/v1/{role}/state',json.dumps({'online':False}),qos=0,retain=False)
        client.connect(broker.hostname,broker.port,5); client.loop_start()
        for work in (normal,urgent): threading.Thread(target=execute,args=(work,),daemon=True).start()
        while True:
            try:
                with urllib.request.urlopen(urllib.request.Request(base+'/status',headers={'X-Device-Token':token}),timeout=1) as response:
                    online=json.load(response).get('wifiOnline',True)
            except (OSError,ValueError): online=False
            if network_up and not online:
                network_up=False
                if client.is_connected(): client.publish(f'plant/v1/{role}/state',json.dumps({'online':False}),qos=0,retain=False)
                client.disconnect(); client.loop_stop()
            elif online and not network_up:
                try:
                    client.reconnect(); client.loop_start(); network_up=True
                except OSError: pass
            if network_up and client.is_connected(): client.publish(f'plant/v1/{role}/state',json.dumps({'online':True,'connectionId':connection}),qos=0,retain=False)
            time.sleep(.25)
    thread=threading.Thread(target=board,daemon=True); thread.start(); clients.append(thread)
print('MQTT software bridges active; hardware output disabled',flush=True)
while all(thread.is_alive() for thread in clients): time.sleep(.5)
raise SystemExit('Simulator bridge stopped')
