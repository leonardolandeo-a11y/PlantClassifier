#!/usr/bin/env python3
"""Start Docker and Expo on the detected LAN without keyboard input."""
import argparse
import ipaddress
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
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


def print_qr(ip):
    # Expo hides its terminal UI in CI mode. Reuse its installed QR renderer so
    # a closed stdin never prevents showing the code or causes a prompt.
    run(['node', '-e', """
const path = require('node:path');
const expo = require.resolve('expo/package.json');
const cli = require.resolve('@expo/cli/package.json', { paths: [path.dirname(expo)] });
const { printQRCode } = require(path.join(path.dirname(cli), 'build/src/utils/qr.js'));
printQRCode(process.argv[1]).print();
console.log('Expo Go: ' + process.argv[1]);
""", f'exp://{ip}:8081'], cwd=ROOT / 'mobile', stdin=subprocess.DEVNULL)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', default='.env.lab', help='Archivo privado Compose existente, relativo a la raíz (por defecto .env.lab)')
    parser.add_argument('--interface', help='Interfaz física, por ejemplo wlp2s0; nunca una IP fija')
    args = parser.parse_args()
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
    env.setdefault('COMPOSE_PROJECT_NAME', 'plantclassifier-lab')
    # Explicit files prevent an ambient COMPOSE_FILE or automatic override exposing other services.
    with tempfile.TemporaryDirectory(prefix='plant-wifi-') as directory:
        override = Path(directory) / 'wifi.yaml'
        override.write_text('services:\n  app:\n    restart: "no"\n')
        compose = ['docker', 'compose', '--env-file', str(ROOT / args.env_file), '--project-directory', str(ROOT), '-f', str(ROOT / 'docker-compose.yaml'), '-f', str(override)]
        config = json.loads(run(compose + ['config', '--format', 'json'], env=env, capture_output=True, text=True).stdout)
        port = validate_config(config, ip)
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
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        # Do not print captured Compose config: it contains credentials.
        print(f'Wi-Fi: {error}', file=sys.stderr)
        sys.exit(1)
