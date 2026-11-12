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
        self.steering = 'CENTER'
        self.lock = threading.Lock()
        self.wifi_online = True
        self.servo_epoch = secrets.randbits(31) or 1
        self.servo_sequence = 0
        self.servo_active = False
        self.servo_angle = 100
        self.servo_command = 'HOLD'
        self.servo_last = self.now()
        self.servo_step = self.now()

    def now(self):
        return int((time.monotonic() - self.started) * 1000) & 0xffffffff

    def servo_status(self):
        labels = {'INCREASE':'increasing','DECREASE':'decreasing','CENTER':'centering','HOLD':'holding'}
        return {'angle':self.servo_angle,'state':labels[self.servo_command], 'epoch':self.servo_epoch,
                'sequence':self.servo_sequence,'deviceTimeMs':self.now()}

    def expire(self):
        if self.servo_active:
            now = self.now()
            if ((now - self.servo_last) & 0xffffffff) >= 1000:
                self.servo_active = False
                self.servo_command = 'HOLD'
            steps = ((now - self.servo_step) & 0xffffffff) // 15
            if steps:
                self.servo_step = now
                target = {'INCREASE':130,'DECREASE':70,'CENTER':100,'HOLD':self.servo_angle}[self.servo_command]
                self.servo_angle += max(-2*steps,min(2*steps,target-self.servo_angle))
                if self.servo_angle == target: self.servo_command = 'HOLD'
        if self.session and ((self.now() - self.last) & 0xffffffff) > 1500:
            self.session = None
            self.command, self.speed = 'STOP', 0
            self.steering = 'CENTER'
            print('[FAILSAFE] Control lost -> STOP (simulated)', flush=True)


def make_server(host, port, token, role="movement"):
    if role not in ("sensor", "movement"):
        raise ValueError("Choose sensor or movement role")
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
                if self.path == '/servo' and role == 'sensor':
                    self.reply(200,state.servo_status())
                elif self.path == '/status' and role == 'sensor':
                    self.reply(200, {'status': 'online', 'role': 'sensor', 'mode': 'simulation',
                                    'simulated': True, 'hardwareOutputEnabled': False,'wifiOnline':state.wifi_online,
                                    'temperatureSource': 'software', 'humiditySource': 'software', 'phSource': 'software', 'soilMoisture': 45.0, 'soilMoistureSource': 'software'})
                elif self.path == '/status':
                    self.reply(200, {'status': 'online', 'mode': 'simulation', 'simulated': True,
                                    'role': role, 'hardwareOutputEnabled': False,
                                    'wifiOnline':state.wifi_online,
                                    'controlActive': state.session is not None,
                                    'command': state.command, 'speed': state.speed,
                                    'protocolVersion': 2, 'steering': state.steering,
                                    'steeringAngle': {'LEFT':70,'CENTER':100,'RIGHT':130}[state.steering],
                                    'physicalMotionVerified': False})
                elif not state.wifi_online:
                    self.reply(503,{'error':'Simulated Wi-Fi disconnected'})
                elif self.path == '/capture' and role == 'sensor':
                    print('[SENSOR] SIMULATION ph=6.5 temperature=25.0 humidity=60.0', flush=True)
                    self.reply(200, {'ph': 6.5, 'temperature': 25.0, 'humidity': 60.0, 'simulated': True,
                                    'temperatureSource': 'software', 'humiditySource': 'software', 'phSource': 'software', 'soilMoisture': 45.0, 'soilMoistureSource': 'software'})
                else:
                    self.reply(404, {'error': 'Not found'})

        def do_POST(self):
            if not self.authorized():
                return
            with state.lock:
                if self.path == '/simulation/wifi':
                    try:
                        length=int(self.headers.get('Content-Length','0'))
                        if not 0 < length <= 64: raise ValueError()
                        data=json.loads(self.rfile.read(length))
                        if type(data.get('online')) is not bool: raise ValueError()
                    except (ValueError,TypeError):
                        self.reply(400,{'error':'Invalid simulation fixture'}); return
                    state.wifi_online=data['online']
                    if not state.wifi_online:
                        state.session=None; state.command='STOP'; state.speed=0; state.steering='CENTER'
                        state.servo_active=False; state.servo_command='HOLD'
                    self.reply(200,{'simulated':True,'online':state.wifi_online}); return
                if not state.wifi_online:
                    self.reply(503,{'error':'Simulated Wi-Fi disconnected'}); return
            if role == "sensor":
                with state.lock:
                    state.expire()
                    if self.path == '/servo-session':
                        state.servo_epoch = (state.servo_epoch + 1) & 0xffffffff or 1
                        state.servo_sequence = 0
                        state.servo_active = True
                        state.servo_last = state.servo_step = state.now()
                        state.servo_command = 'HOLD'
                    elif self.path == '/servo':
                        try:
                            length = int(self.headers.get('Content-Length','0'))
                            if not 0 < length <= 256: raise ValueError()
                            data = json.loads(self.rfile.read(length))
                            command = data['command']
                            if command not in ('INCREASE','DECREASE','CENTER','HOLD'): raise ValueError()
                            if any(type(data[k]) is not int for k in ('epoch','sequence','deadlineMs')): raise ValueError()
                        except (ValueError,KeyError,TypeError):
                            self.reply(400,{'error':'Invalid servo command'}); return
                        remaining = (data['deadlineMs'] - state.now()) & 0xffffffff
                        if (not state.servo_active or data['epoch'] != state.servo_epoch or data['sequence'] <= state.servo_sequence
                                or (command != 'HOLD' and not 0 < remaining <= 1000)):
                            self.reply(409,{'error':'Expired servo control'}); return
                        state.servo_sequence = data['sequence']; state.servo_last = state.now()
                        state.servo_command = 'HOLD' if command == 'CENTER' and state.servo_angle == 100 else command
                        if command == 'HOLD': state.servo_active = False
                    else:
                        self.reply(404,{'error':'Not found'}); return
                    self.reply(200,state.servo_status())
                return
            with state.lock:
                state.expire()
                if self.path == '/control-session':
                    state.session = secrets.token_hex(16)
                    state.sequence, state.last = 0, state.now()
                    state.command, state.speed = 'STOP', 0
                    state.steering = 'CENTER'
                    print('[CONTROL] Session acquired (simulated)', flush=True)
                    self.reply(200, {'sessionId': state.session, 'deviceTimeMs': state.now(), 'protocolVersion': 2})
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
                    steering = data.get('steering', command if command in ('LEFT', 'RIGHT') else 'CENTER')
                    if steering not in ('LEFT', 'CENTER', 'RIGHT') or (command in ('LEFT', 'RIGHT', 'CENTER') and steering != command) or (command == 'STOP' and steering != 'CENTER'):
                        raise ValueError()
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
                state.steering = steering
                state.speed = speed if command in ('FORWARD', 'BACKWARD') else 0
                if command == 'STOP':
                    state.session = None
                print(f'[CMD] {command} speed={state.speed} [SIMULATION]', flush=True)
                self.reply(200, {'status': 'OK', 'command': command, 'speed': state.speed,
                                'simulated': True, 'sessionId': data['sessionId'], 'sequence': sequence,
                                'protocolVersion': 2, 'steering': steering,
                                'angle': {'LEFT':70,'CENTER':100,'RIGHT':130}[steering]})

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
    parser.add_argument('--role', choices=['sensor', 'movement'], default='movement')
    args = parser.parse_args()
    server = make_server(args.host, args.port, os.environ.get('DEVICE_TOKEN', ''), args.role)
    print('[MODE] SOFTWARE SIMULATION - NO HARDWARE ACCESS', flush=True)
    try:
        server.serve_forever()
    finally:
        server.simulator_stop.set()
        server.server_close()
