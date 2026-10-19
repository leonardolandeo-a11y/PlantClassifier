#!/usr/bin/env python3
"""Authenticated protocol tests. Refuses movement unless /status verifies simulation.
Set DEVICE_TOKEN; supply the IP observed from Serial, never an assumed DHCP address.
"""
import argparse
import json
import os
import time
import urllib.error
import urllib.request


def test_device(base, token, capture=False):
    def request(path, data=None, authenticated=True, expected=200):
        headers = {'Content-Type': 'application/json'}
        if authenticated:
            headers['X-Device-Token'] = token
        body = None if data is None else json.dumps(data).encode()
        try:
            response = urllib.request.urlopen(urllib.request.Request(base.rstrip('/') + path, data=body, headers=headers), timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            assert response.status == expected, f'{path}: expected {expected}, got {response.status}'
            return json.load(response)

    request('/status', authenticated=False, expected=401)
    status = request('/status')
    if status.get('role') == 'sensor':
        reading = request('/capture')
        assert 0 <= reading['ph'] <= 14
        assert reading['phSource'] in ('software', 'potentiometer')
        assert 0 <= reading['temperature'] <= 50 and 20 <= reading['humidity'] <= 80
        request('/capture', authenticated=False, expected=401)
        request('/movement', {}, expected=404)
        request('/control-session', {}, expected=404)
        print('PASS sensor: sources, authentication, role isolation')
        return
    assert status.get('mode') == 'simulation' and status.get('hardwareOutputEnabled') is False, 'Refusing commands: simulation safety not verified'
    request('/capture', expected=404)
    for path in ('/control-session', '/movement'):
        request(path, {}, authenticated=False, expected=401)
    session = request('/control-session', {})
    origin = time.monotonic()

    def command(name, sequence, deadline=None, expected=200, session_id=None):
        body = {'command': name, 'speed': 150 if name in ('FORWARD', 'BACKWARD') else 0,
                'sessionId': session_id or session['sessionId'], 'sequence': sequence,
                'deadlineMs': deadline if deadline is not None else (session['deviceTimeMs'] + int((time.monotonic()-origin)*1000) + 1000) & 0xffffffff}
        result = request('/movement', body, expected=expected)
        if expected == 200:
            assert result['simulated'] is True and result['sequence'] == sequence and result['command'] == name
        return result

    request('/movement', {}, expected=400)
    command('FORWARD', 1)
    command('FORWARD', 1, expected=409)
    command('FORWARD', 0, expected=409)
    command('FORWARD', 2, deadline=(session['deviceTimeMs'] - 1000) & 0xffffffff, expected=409)
    command('FORWARD', 2, session_id='0'*32, expected=409)
    for seq, name in enumerate(('FORWARD','BACKWARD','LEFT','RIGHT','CENTER'), 2):
        command(name, seq)
    command('STOP', 7)
    command('FORWARD', 8, expected=409)
    session = request('/control-session', {}); origin = time.monotonic()
    command('LEFT', 1)
    time.sleep(1.65)
    assert request('/status')['controlActive'] is False
    command('FORWARD', 2, expected=409)
    print('PASS device: token, status, safe simulation, sensor ranges, commands, STOP, sequences, deadlines, watchdog')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', required=True)
    parser.add_argument('--no-capture', action='store_true')
    args = parser.parse_args()
    test_device(args.url, os.environ['DEVICE_TOKEN'], False)
