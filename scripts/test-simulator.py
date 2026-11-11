#!/usr/bin/env python3
"""Run the real device HTTP conformance script against a local software simulator."""
import importlib.util
from pathlib import Path
import secrets
import threading
import json
import urllib.request


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


if __name__ == '__main__':
    simulator = module('simulator', 'esp32-simulator.py')
    tests = module('device_tests', 'test-device.py')
    token = secrets.token_hex(32)
    for role in ("sensor", "movement"):
        server = simulator.make_server('127.0.0.1', 0, token, role)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base = f'http://127.0.0.1:{server.server_port}'
            tests.test_device(base, token)
            if role == 'movement':
                def post(path, body):
                    request = urllib.request.Request(base + path, data=json.dumps(body).encode(),
                        headers={'Content-Type':'application/json', 'X-Device-Token':token})
                    with urllib.request.urlopen(request, timeout=5) as response:
                        return json.load(response)
                for command in ('FORWARD', 'BACKWARD'):
                    session = post('/control-session', {})
                    assert session['protocolVersion'] == 2
                    sequence = 0
                    for steering in ('CENTER', 'LEFT', 'RIGHT', 'CENTER'):
                        sequence += 1
                        ack = post('/movement', dict(command=command, speed=150, steering=steering,
                            sessionId=session['sessionId'], sequence=sequence, deadlineMs=session['deviceTimeMs']+1000))
                        assert ack['steering'] == steering and ack['speed'] == 150 and ack['protocolVersion'] == 2
                    ack = post('/movement', dict(command='LEFT', speed=0, steering='LEFT',
                        sessionId=session['sessionId'], sequence=sequence+1, deadlineMs=session['deviceTimeMs']+1000))
                    assert ack['speed'] == 0 and ack['angle'] == 70
                    ack = post('/movement', dict(command='STOP', speed=0,
                        sessionId=session['sessionId'], sequence=sequence+2, deadlineMs=0))
                    assert ack['speed'] == 0 and ack['steering'] == 'CENTER'
                print('PASS simulator v2: combined forward/backward, steering-only and priority STOP')
        finally:
            server.simulator_stop.set()
            server.shutdown()
            server.server_close()
            thread.join()
