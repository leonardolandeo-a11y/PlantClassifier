#!/usr/bin/env python3
"""HTTP-only device simulator. Uses the firmware's token/session/sequence/deadline contract.
No hardware access. Start with DEVICE_TOKEN set; never prints tokens or session IDs.
"""
import argparse
import hmac
import json
import os
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class DeviceState:
    def __init__(self):
        self.started = time.monotonic()
        self.session = None
        self.sequence = 0
        self.last = 0
        self.command = 'STOP'
        self.speed = 0
        self.lock = threading.Lock()

    def now(self):
        return int((time.monotonic() - self.started) * 1000) & 0xffffffff

    def expire(self):
        if self.session and ((self.now() - self.last) & 0xffffffff) > 1500:
            self.session = None
            self.command, self.speed = 'STOP', 0
            print('[FAILSAFE] Control lost -> STOP (simulated)', flush=True)


def make_server(host, port, token):
    if len(token) < 32 or token.startswith('REPLACE_'):
        raise ValueError('Set DEVICE_TOKEN with at least 32 characters')
    state = DeviceState()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def reply(self, code, data):
            body = json.dumps(data).encode()
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def authorized(self):
            if not hmac.compare_digest(self.headers.get('X-Device-Token', '').encode(), token.encode()):
                self.reply(401, {'error': 'Unauthorized'})
                return False
            return True

        def do_GET(self):
            if not self.authorized():
                return
            with state.lock:
                state.expire()
                if self.path == '/status':
                    self.reply(200, {'status': 'online', 'mode': 'simulation', 'simulated': True,
                                    'sensorSimulated': True, 'hardwareOutputEnabled': False,
                                    'controlActive': state.session is not None,
                                    'command': state.command, 'speed': state.speed})
                elif self.path == '/capture':
                    print('[SENSOR] SIMULATION ph=6.5 temperature=25.0 humidity=60.0', flush=True)
                    self.reply(200, {'ph': 6.5, 'temperature': 25.0, 'humidity': 60.0, 'simulated': True})
                else:
                    self.reply(404, {'error': 'Not found'})

        def do_POST(self):
            if not self.authorized():
                return
            with state.lock:
                state.expire()
                if self.path == '/control-session':
                    state.session = secrets.token_hex(16)
                    state.sequence, state.last = 0, state.now()
                    state.command, state.speed = 'STOP', 0
                    print('[CONTROL] Session acquired (simulated)', flush=True)
                    self.reply(200, {'sessionId': state.session, 'deviceTimeMs': state.now()})
                    return
                if self.path != '/movement':
                    self.reply(404, {'error': 'Not found'})
                    return
                try:
                    length = int(self.headers.get('Content-Length', '0'))
                    if not 0 < length <= 1024:
                        raise ValueError()
                    data = json.loads(self.rfile.read(length))
                    command = data['command'].upper()
                    speed, sequence, deadline = (data[k] for k in ('speed', 'sequence', 'deadlineMs'))
                    if (command not in ('FORWARD', 'BACKWARD', 'LEFT', 'RIGHT', 'CENTER', 'STOP')
                            or any(type(v) is not int for v in (speed, sequence, deadline))
                            or not 0 <= speed <= 255 or not 0 <= deadline <= 0xffffffff
                            or not isinstance(data['sessionId'], str)):
                        raise ValueError()
                except (ValueError, KeyError, TypeError, AttributeError):
                    self.reply(400, {'error': 'Invalid command fields'})
                    return
                remaining = (deadline - state.now()) & 0xffffffff
                if (state.session is None or data['sessionId'] != state.session
                        or not state.sequence < sequence <= 2147483647
                        or (command != 'STOP' and not 0 < remaining <= 1500)):
                    self.reply(409, {'error': 'Stale, duplicate or expired control'})
                    return
                state.sequence, state.last = sequence, state.now()
                state.command = command
                state.speed = speed if command in ('FORWARD', 'BACKWARD') else 0
                if command == 'STOP':
                    state.session = None
                print(f'[CMD] {command} speed={state.speed} [SIMULATION]', flush=True)
                self.reply(200, {'status': 'OK', 'command': command, 'speed': state.speed,
                                'simulated': True, 'sessionId': data['sessionId'], 'sequence': sequence})

    server = ThreadingHTTPServer((host, port), Handler)
    server.daemon_threads = True
    stopped = threading.Event()

    def watchdog():
        while not stopped.wait(.025):
            with state.lock:
                state.expire()

    threading.Thread(target=watchdog, daemon=True).start()
    server.simulator_stop = stopped
    return server


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8081)
    args = parser.parse_args()
    server = make_server(args.host, args.port, os.environ.get('DEVICE_TOKEN', ''))
    print('[MODE] SOFTWARE SIMULATION - NO HARDWARE ACCESS', flush=True)
    try:
        server.serve_forever()
    finally:
        server.simulator_stop.set()
        server.server_close()
