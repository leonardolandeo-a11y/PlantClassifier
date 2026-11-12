#!/usr/bin/env python3
"""Read-only HTTP /status or MQTT GET /status. Never acquires control or captures data."""
import argparse
import json
import math
import os
import queue
import time
import urllib.request
import uuid


def summary(values, attempted):
    ordered = sorted(values)
    def percentile(p):
        return ordered[max(0, math.ceil(len(ordered) * p) - 1)] if ordered else None
    return dict(attempted=attempted, received=len(values), losses=attempted-len(values),
                p50_ms=percentile(.5), p95_ms=percentile(.95), p99_ms=percentile(.99),
                max_ms=max(ordered) if ordered else None)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('transport', choices=['http', 'mqtt'])
    parser.add_argument('--host', required=True, help='ESP32 IP for HTTP; Ubuntu broker IP for MQTT')
    parser.add_argument('--port', type=int)
    parser.add_argument('--role', choices=['movement', 'sensor'], default='movement')
    parser.add_argument('--count', type=int, default=100)
    parser.add_argument('--interval', type=float, default=.25)
    parser.add_argument('--timeout', type=float, default=.75)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    if not 1 <= args.count <= 10000 or args.interval < .1 or not .05 <= args.timeout <= 5:
        parser.error('count 1..10000, interval >= .1 s, timeout .05..5 s')
    samples, processing, failures, states = [], [], [], []
    client = None
    connection_error = None
    presence = {}
    incoming = queue.Queue(maxsize=64)
    if args.transport == 'mqtt':
        import paho.mqtt.client as mqtt
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id='plant-diagnostic-'+uuid.uuid4().hex,
                             clean_session=True)
        client.username_pw_set(os.environ.get('MQTT_USERNAME', 'backend'), os.environ['MQTT_PASSWORD'])
        def connected(c, userdata, flags, reason, properties):
            if reason == 0:
                c.subscribe([(f'plant/v1/{args.role}/state', 0), (f'plant/v1/{args.role}/ack', 0),
                             (f'plant/v1/{args.role}/telemetry', 0)])
        def message(c, userdata, msg):
            if msg.retain or len(msg.payload) > 8192:
                return
            try:
                value = json.loads(msg.payload)
                if msg.topic.endswith('/state'):
                    presence.clear()
                    if value.get('online'):
                        presence.update(value, seen=time.monotonic())
                    states.append(value)
                elif msg.topic.endswith('/telemetry'):
                    states.append({'telemetry': value.get('body')})
                else:
                    incoming.put_nowait(value)
            except (ValueError, queue.Full):
                pass
        client.on_connect, client.on_message = connected, message
        client.on_disconnect = lambda *unused: presence.clear()
        try:
            client.connect(args.host, args.port or 1883, 5)
            client.loop_start()
            until = time.monotonic() + 5
            while not presence and time.monotonic() < until:
                time.sleep(.05)
        except OSError as error:
            connection_error = error
    try:
        for _ in range(args.count):
            started = time.monotonic()
            try:
                if client:
                    if connection_error is not None:
                        raise connection_error
                    state = presence.copy()
                    if time.monotonic() - state.get('seen', 0) > 3:
                        raise TimeoutError('No fresh ESP32 presence')
                    request_id = str(uuid.uuid4())
                    connection = state['connectionId']
                    client.publish(f'plant/v1/{args.role}/command', json.dumps(dict(
                        id=request_id, connectionId=connection, method='GET', path='/status', body={})), qos=0, retain=False)
                    while True:
                        left = args.timeout - (time.monotonic()-started)
                        if left <= 0:
                            raise TimeoutError('Firmware ACK timeout')
                        ack = incoming.get(timeout=left)
                        if ack.get('id') == request_id and ack.get('connectionId') == connection:
                            break
                    if ack.get('status') != 200:
                        raise ValueError('ESP32 rejected diagnostic')
                    if 'receivedMs' in ack and 'ackMs' in ack:
                        processing.append((ack['ackMs']-ack['receivedMs']) & 0xffffffff)
                else:
                    request = urllib.request.Request(f'http://{args.host}:{args.port or 80}/status',
                        headers={'X-Device-Token': os.environ['DEVICE_TOKEN']})
                    with urllib.request.urlopen(request, timeout=args.timeout) as response:
                        value = json.loads(response.read(8193))
                        if value.get('status') != 'online':
                            raise ValueError('Invalid device status')
                samples.append((time.monotonic()-started)*1000)
            except (OSError, ValueError, TimeoutError, queue.Empty) as error:
                failures.append(type(error).__name__)
            time.sleep(max(0, args.interval-(time.monotonic()-started)))
    finally:
        if client:
            client.disconnect()
            client.loop_stop()
    result = dict(transport=args.transport, operation='GET /status (no actuators)', role=args.role,
                  round_trip=summary(samples, args.count), firmware_queue_and_handler=summary(processing, len(processing)),
                  samples_ms=samples, errors=failures, presence_and_telemetry=states,
                  note='RTT includes client, broker, network, firmware queue and ACK. Not mechanical motion or one-way latency.')
    with open(args.output, 'w', encoding='utf8') as output:
        json.dump(result, output, indent=2)
    print(json.dumps(dict(result['round_trip'], errors=failures), indent=2))


if __name__ == '__main__':
    main()
