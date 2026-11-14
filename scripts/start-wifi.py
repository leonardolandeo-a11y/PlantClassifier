#!/usr/bin/env python3
"""Start Expo on the detected private LAN: --simulate is isolated; default keeps hardware HTTP."""
import argparse
import fcntl
import ipaddress
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import uuid
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = tuple(ipaddress.ip_network(net) for net in ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'))


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def networks():
    links = json.loads(run(['ip', '-j', '-4', 'address', 'show', 'up'], capture_output=True, text=True).stdout)
    result = []
    for link in links:
        name = link['ifname']
        # Physical Wi-Fi/Ethernet only: exclude VPN, Docker, bridges and loopback.
        if not Path('/sys/class/net', name, 'device').exists():
            continue
        for address in link.get('addr_info', []):
            ip = ipaddress.ip_address(address['local'])
            if address.get('scope') == 'global' and any(ip in net for net in PRIVATE):
                result.append((name, str(ip), address['prefixlen']))
    return result


def select_network(options, interface=None):
    candidates = [item for item in options if interface is None or item[0] == interface]
    if len(candidates) != 1:
        choices = ', '.join(f'{name}: {ip}/{prefix}' for name, ip, prefix in options) or 'ninguna'
        raise ValueError(f'No hay una única IPv4 LAN física seleccionada ({choices}). Usa --interface NOMBRE; desconecta VPN/interfaces ambiguas. No se aceptan IP públicas.')
    return candidates[0]


def connection_name(interface):
    if not shutil.which('nmcli'):
        raise ValueError('Se requiere nmcli (NetworkManager de Ubuntu) para identificar la red confiable.')
    return run(['nmcli', '-g', 'GENERAL.CONNECTION', 'device', 'show', interface], capture_output=True, text=True).stdout.strip()


def validate_config(config, ip):
    services = config['services']
    ports = services['app'].get('ports', [])
    if len(ports) != 1 or ports[0].get('host_ip') != ip or int(ports[0]['target']) != 8080:
        raise ValueError('Publicación inesperada del backend; no se iniciará LAN.')
    for name, service in services.items():
        if name != 'app' and any(p.get('host_ip') not in ('127.0.0.1', '::1') for p in service.get('ports', [])):
            raise ValueError(f'{name} expone puertos fuera de loopback; inicio cancelado.')
    port = int(ports[0]['published'])
    if not 1 <= port <= 65535:
        raise ValueError('APP_PORT inválido.')
    return port


def validate_transport(environment):
    if environment.get('COMPOSE_FILE') or environment.get('DEVICE_TRANSPORT', 'http').lower() != 'http' or environment.get('MQTT_PASSWORD') or environment.get('MQTT_URL'):
        raise ValueError('start-wifi.py solo soporta HTTP. Configuración MQTT/COMPOSE_FILE detectada; no se cambiará de transporte. Consulta docs/END_TO_END_REVIEW.md para el flujo MQTT local.')


def validate_project(resources):
    for labels in resources:
        labels = labels or {}
        if labels.get('com.plantclassifier.wifi-launcher') != 'http-v1':
            raise ValueError('El proyecto Compose contiene recursos ajenos al lanzador HTTP. Usa un COMPOSE_PROJECT_NAME dedicado; no se modificarán los existentes.')


def print_qr(ip, port=8081):
    # Expo hides its terminal UI in CI mode. Reuse its installed QR renderer so
    # a closed stdin never prevents showing the code or causes a prompt.
    run(['node', '-e', """
const path = require('node:path');
const expo = require.resolve('expo/package.json');
const cli = require.resolve('@expo/cli/package.json', { paths: [path.dirname(expo)] });
const { printQRCode } = require(path.join(path.dirname(cli), 'build/src/utils/qr.js'));
printQRCode(process.argv[1]).print();
console.log('Expo Go: ' + process.argv[1]);
""", f'exp://{ip}:{port}'], cwd=ROOT / 'mobile', stdin=subprocess.DEVNULL)


def free_metro_port(ip):
    # Never terminate an unrelated Metro process.
    with socket.socket() as listener:
        listener.bind((ip, 0))
        return listener.getsockname()[1]


def simulate(interface, no_build=False):
    for tool in ('ip', 'docker', 'npm', 'node'):
        if not shutil.which(tool):
            raise ValueError(f'Falta {tool}; consulta las dependencias Expo Go en README.md.')
    if not (ROOT / 'mobile/node_modules/expo').exists():
        raise ValueError('Instala dependencias móviles: npm ci --prefix mobile')
    selected = select_network(networks(), interface)
    name, ip, prefix = selected
    print(f'Demo HTTP explícita con dos simuladores; no se carga .env.lab ni MQTT. LAN: {name} {ip}/{prefix}', flush=True)
    # Remove Compose/Expo ambient settings; no private dotenv is read by either tool.
    env = {k: v for k, v in os.environ.items() if not k.startswith(('COMPOSE_', 'EXPO_', 'REACT_NATIVE_'))}
    env.update(EXPO_NO_DOTENV='1', REACT_NATIVE_PACKAGER_HOSTNAME=ip, CI='1')
    with tempfile.TemporaryDirectory(prefix='plant-demo-wifi-') as directory:
        override = Path(directory) / 'lan.yaml'
        override.write_text('services:\n  web:\n    ports: !override\n      - target: 8080\n        host_ip: ' + ip + '\n        published: "0"\n')
        # Each invocation owns its containers; only the demo data volume is shared.
        project = 'plantclassifier-demo-wifi-' + uuid.uuid4().hex[:10]
        with override.open('a') as config:
            config.write('volumes:\n  demo_data:\n    name: plantclassifier-demo-wifi_demo_data\n')
        images = Path(directory) / 'images.json'
        images.write_text(json.dumps({'services': {name: {'image': f'plantclassifier-demo-wifi-{name}:latest'}
            for name in ('app', 'simulator', 'sensor-simulator')}}))
        compose = ['docker', 'compose', '--env-file', os.devnull, '-p', project,
                   '-f', str(ROOT / 'docker-compose.demo.yaml'), '-f', str(override), '-f', str(images)]
        expo = None
        started = False
        # Do not open the persistent demo database from two sessions.
        active = run(['docker', 'ps', '-q', '--filter',
                      'volume=plantclassifier-demo-wifi_demo_data'],
                     env=env, capture_output=True, text=True).stdout.strip()
        if active:
            raise ValueError('El volumen de demo ya está en uso; cierra su sesión antes de iniciar otra.')
        try:
            started = True
            run(compose + ['up', '-d', '--no-build' if no_build else '--build', '--wait'], env=env, cwd=ROOT)
            published = run(compose + ['port', 'web', '8080'], env=env, capture_output=True, text=True).stdout.strip()
            if published.rsplit(':', 1)[0] != ip:
                raise ValueError('Docker publicó una interfaz inesperada.')
            url = 'http://' + published
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(url + '/csrf', timeout=8) as response:
                if not json.load(response).get('token'):
                    raise ValueError('Backend sin sesión CSRF válida.')
            env['EXPO_PUBLIC_API_URL'] = url
            port = free_metro_port(ip)
            print(f'Backend verificado: {url}; Metro usará el puerto libre {port}.', flush=True)
            expo = subprocess.Popen(['npm', 'start', '--prefix', 'mobile', '--', '--lan', '--go', '--clear', '--port', str(port)],
                                    cwd=ROOT, env=env, stdin=subprocess.DEVNULL, start_new_session=True)
            deadline = time.monotonic() + 90
            while True:
                if expo.poll() is not None:
                    raise ValueError('Metro terminó antes de estar listo. Revisa el error anterior y vuelve a ejecutar; no se detuvieron procesos ajenos.')
                if selected not in networks():
                    raise ValueError('Cambió la IP LAN; ejecuta de nuevo el comando.')
                try:
                    with opener.open(f'http://{ip}:{port}/status', timeout=2) as response:
                        if response.read() == b'packager-status:running':
                            break
                except (OSError, urllib.error.URLError):
                    pass
                if time.monotonic() >= deadline:
                    raise ValueError('Metro no está listo tras 90 s; revisa firewall/puerto y vuelve a ejecutar.')
                time.sleep(1)
            print_qr(ip, port)
            print('Teléfono en la misma Wi-Fi privada. Ctrl+C detiene esta demo LAN y conserva sus datos.', flush=True)
            while expo.poll() is None:
                time.sleep(3)
                if selected not in networks():
                    raise ValueError('Cambió la IP LAN; ejecuta de nuevo el comando.')
            return expo.returncode
        finally:
            if expo is not None and expo.poll() is None:
                os.killpg(expo.pid, signal.SIGTERM)
                try:
                    expo.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(expo.pid, signal.SIGKILL)
                    expo.wait()
            if started:
                run(compose + ['down'], env=env, cwd=ROOT)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', default='.env.lab', help='Solo hardware: archivo privado Compose relativo a la raíz (por defecto .env.lab)')
    parser.add_argument('--interface', help='Interfaz física, por ejemplo wlp2s0; nunca una IP fija')
    parser.add_argument('--simulate', action='store_true', help='Demo aislada sin hardware ni archivos privados')
    parser.add_argument('--no-build', action='store_true', help='Reutiliza imágenes demo ya construidas (solo --simulate)')
    args = parser.parse_args()
    if args.simulate:
        with open(Path(tempfile.gettempdir()) / f'plant-demo-wifi-{os.getuid()}.lock', 'a') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise ValueError('Ya hay una sesión de demo Wi-Fi activa.') from None
            return simulate(args.interface, args.no_build)
    for tool in ('ip', 'docker', 'npm', 'node'):
        if not shutil.which(tool):
            raise ValueError(f'Falta {tool}.')
    if not (ROOT / 'mobile/node_modules/expo').exists():
        raise ValueError('Instala dependencias primero: npm ci && npm ci --prefix mobile')
    interface, ip, prefix = selected = select_network(networks(), args.interface)
    identity = connection_name(interface)
    if not identity or identity == '--':
        raise ValueError('NetworkManager no identifica la conexión. Selecciona otra interfaz.')
    print(f'Red: {identity} · interfaz {interface} · IPv4 {ip}/{prefix}', flush=True)
    env = dict(os.environ, APP_BIND_ADDRESS=ip)
    env['COMPOSE_PROJECT_NAME'] = env.get('COMPOSE_PROJECT_NAME') or 'plantclassifier-wifi'
    validate_transport(env)
    # Explicit files prevent an ambient COMPOSE_FILE or automatic override exposing other services.
    with tempfile.TemporaryDirectory(prefix='plant-wifi-') as directory:
        override = Path(directory) / 'wifi.yaml'
        override.write_text('services:\n  app:\n    restart: "no"\n    labels:\n      com.plantclassifier.wifi-launcher: http-v1\n  db:\n    labels:\n      com.plantclassifier.wifi-launcher: http-v1\nvolumes:\n  plantclassifier_postgres_data:\n    labels:\n      com.plantclassifier.wifi-launcher: http-v1\n')
        compose = ['docker', 'compose', '--env-file', str(ROOT / args.env_file), '--project-directory', str(ROOT), '-f', str(ROOT / 'docker-compose.yaml'), '-f', str(override)]
        config = json.loads(run(compose + ['config', '--format', 'json'], env=env, capture_output=True, text=True).stdout)
        port = validate_config(config, ip)
        effective = run(compose + ['config', '--environment'], env=env, capture_output=True, text=True).stdout
        validate_transport(dict(line.split('=', 1) for line in effective.splitlines() if '=' in line))
        ids = run(['docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=' + env['COMPOSE_PROJECT_NAME']], env=env, capture_output=True, text=True).stdout.split()
        if ids:
            labels = run(['docker', 'inspect', '--format', '{{json .Config.Labels}}', *ids], env=env, capture_output=True, text=True).stdout
            validate_project([json.loads(line) for line in labels.splitlines()])
        volumes = run(['docker', 'volume', 'ls', '-q', '--filter', 'label=com.docker.compose.project=' + env['COMPOSE_PROJECT_NAME']], env=env, capture_output=True, text=True).stdout.split()
        if volumes:
            labels = run(['docker', 'volume', 'inspect', '--format', '{{json .Labels}}', *volumes], env=env, capture_output=True, text=True).stdout
            validate_project([json.loads(line) for line in labels.splitlines()])
        print(f'Modo HTTP · proyecto Compose: {env["COMPOSE_PROJECT_NAME"]} · volumen independiente del laboratorio', flush=True)
        url = f'http://{ip}:{port}'
        env.update(EXPO_PUBLIC_API_URL=url, REACT_NATIVE_PACKAGER_HOSTNAME=ip, EXPO_NO_DOTENV='1')
        expo = None
        started = False
        def unchanged():
            return selected in networks() and connection_name(interface) == identity
        try:
            if not unchanged():
                raise ValueError('La red cambió antes del inicio; ejecuta de nuevo el comando.')
            started = True
            run(compose + ['up', '-d', '--build', '--wait', '--wait-timeout', '180', 'app'], env=env, cwd=ROOT)
            if not unchanged():
                raise ValueError('La red cambió durante el arranque; se cierra el backend LAN.')
            # No proxy: verify the actual published LAN socket and read-only endpoint.
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(url + '/sensors', timeout=8) as response:
                if response.status not in (200, 204):
                    raise ValueError('El backend no confirma lecturas por LAN.')
            print(f'Backend verificado desde Ubuntu: {url}/sensors\n'
                  'Escanea el QR con Expo Go. «Conectado» confirma el trayecto real teléfono → backend.\n'
                  f'Si falla: abre {url}/sensors desde el teléfono. Si Ubuntu responde pero el teléfono no,\n'
                  'revisa aislamiento AP/clientes, Wi-Fi invitados, VPN o firewall. Usa una red/hotspot privada;\n'
                  'no desactives el firewall ni abras un túnel público. Ctrl+C detiene Expo y el backend LAN.', flush=True)
            expo = subprocess.Popen(['npm', 'start', '--prefix', 'mobile', '--', '--lan', '--go', '--clear', '--port', '8081'], cwd=ROOT, env=dict(env, CI='1'), stdin=subprocess.DEVNULL, start_new_session=True)
            print_qr(ip)
            while expo.poll() is None:
                time.sleep(3)
                if not unchanged():
                    raise ValueError('Cambió la red/IP seleccionada; se detiene la sesión LAN. Ejecuta de nuevo el comando.')
            return expo.returncode
        finally:
            if expo is not None and expo.poll() is None:
                os.killpg(expo.pid, signal.SIGTERM)
                try:
                    expo.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(expo.pid, signal.SIGKILL)
                    expo.wait()
            if started:
                print('\nCerrando backend LAN (se conservan datos PostgreSQL)…', flush=True)
                run(compose + ['stop', 'app'], env=env, cwd=ROOT)


if __name__ == '__main__':
    for stop_signal in (signal.SIGINT, signal.SIGTERM):
        signal.signal(stop_signal, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        # Do not print captured Compose config: it contains credentials.
        print(f'Wi-Fi: {error}', file=sys.stderr)
        sys.exit(1)
