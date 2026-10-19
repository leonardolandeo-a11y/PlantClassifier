#!/usr/bin/env python3
"""Run the real device HTTP conformance script against a local software simulator."""
import importlib.util
from pathlib import Path
import secrets
import threading


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


if __name__ == '__main__':
    simulator = module('simulator', 'esp32-simulator.py')
    tests = module('device_tests', 'test-device.py')
    token = secrets.token_hex(32)
    server = simulator.make_server('127.0.0.1', 0, token)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        tests.test_device(f'http://127.0.0.1:{server.server_port}', token)
    finally:
        server.simulator_stop.set()
        server.shutdown()
        server.server_close()
        thread.join()
