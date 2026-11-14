#!/usr/bin/env python3
import importlib.util
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('wifi', __file__.replace('test-start-wifi.py', 'start-wifi.py'))
wifi = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wifi)


class WifiTests(unittest.TestCase):
    def test_selection_requires_unambiguous_interface(self):
        one = ('wlp2s0', '192.168.2.8', 24)
        two = ('enp3s0', '10.1.2.3', 24)
        self.assertEqual(wifi.select_network([one]), one)
        self.assertEqual(wifi.select_network([one, two], 'enp3s0'), two)
        for options, interface in (([], None), ([one, two], None), ([one], 'vpn0'), ([one, ('wlp2s0', '10.2.3.4', 24)], 'wlp2s0')):
            with self.assertRaises(ValueError):
                wifi.select_network(options, interface)

    def test_compose_is_lan_only_for_backend(self):
        config = {'services': {'app': {'ports': [{'host_ip': '10.1.2.3', 'target': 8080, 'published': '18081'}]}, 'db': {'ports': [{'host_ip': '127.0.0.1'}]}}}
        self.assertEqual(wifi.validate_config(config, '10.1.2.3'), 18081)
        for host in ('0.0.0.0', '', '192.168.2.4'):
            config['services']['db']['ports'][0]['host_ip'] = host
            with self.assertRaises(ValueError):
                wifi.validate_config(config, '10.1.2.3')
        config['services'].pop('db')
        with self.assertRaises(ValueError):
            wifi.validate_config(config, '10.1.2.4')

    def test_short_command_is_noninteractive_and_uses_dedicated_project(self):
        self.check_start([], {}, '.env.lab', 'plantclassifier-wifi')

    def test_explicit_project_and_env_file_are_respected(self):
        self.check_start(['--env-file', '.env.personal'],
                         {'COMPOSE_PROJECT_NAME': 'my-project'}, '.env.personal', 'my-project')

    def test_empty_project_uses_dedicated_default(self):
        self.check_start([], {'COMPOSE_PROJECT_NAME': ''}, '.env.lab', 'plantclassifier-wifi')

    def test_ctrl_c_stops_expo_and_only_backend(self):
        self.check_start([], {}, '.env.lab', 'plantclassifier-wifi', interrupt=True)

    def check_start(self, arguments, environment, env_file, project, interrupt=False):
        import json
        from types import SimpleNamespace
        from unittest.mock import MagicMock
        config = {'services': {'app': {'ports': [{'host_ip': '192.168.2.8', 'target': 8080, 'published': '18081'}]}}}
        process = MagicMock()
        process.poll.return_value = 0
        process.returncode = 0
        opener = MagicMock()
        opener.open.return_value.__enter__.return_value.status = 204
        with patch.object(wifi.sys, 'argv', ['start-wifi.py'] + arguments), patch.dict(wifi.os.environ, environment, clear=True), patch.object(wifi.shutil, 'which', return_value='/usr/bin/tool'), patch.object(wifi.Path, 'exists', return_value=True), patch.object(wifi, 'networks', return_value=[('wlp2s0', '192.168.2.8', 24)]), patch.object(wifi, 'connection_name', return_value='Lab'), patch.object(wifi.sys.stdin, 'isatty', return_value=False), patch('builtins.input', side_effect=AssertionError('Unexpected prompt')), patch('builtins.print'), patch.object(wifi, 'run', side_effect=lambda command, **kw: SimpleNamespace(stdout=json.dumps(config) if command[-2:]==['--format','json'] else '')) as run, patch.object(wifi.subprocess, 'Popen', return_value=process) as popen, patch.object(wifi.urllib.request, 'build_opener', return_value=opener), patch.object(wifi, 'print_qr') as qr, patch.object(wifi.time, 'sleep', side_effect=KeyboardInterrupt), patch.object(wifi.os, 'killpg') as killpg:
            if interrupt:
                process.poll.return_value = None
                with self.assertRaises(KeyboardInterrupt):
                    wifi.main()
                killpg.assert_called_once_with(process.pid, wifi.signal.SIGTERM)
                process.wait.assert_called_once_with(timeout=10)
            else:
                self.assertEqual(wifi.main(), 0)
            qr.assert_called_once_with('192.168.2.8')
        for call in run.call_args_list:
            self.assertEqual(call.kwargs['env']['COMPOSE_PROJECT_NAME'], project)
            if call.args[0][1] == 'compose':
                self.assertIn(str(wifi.ROOT / env_file), call.args[0])
            self.assertNotIn('down', call.args[0])
            self.assertNotIn('-v', call.args[0])
        self.assertEqual(run.call_args_list[-1].args[0][-2:], ['stop', 'app'])
        self.assertEqual(popen.call_args.kwargs['env']['EXPO_PUBLIC_API_URL'], 'http://192.168.2.8:18081')
        self.assertEqual(popen.call_args.kwargs['env']['EXPO_NO_DOTENV'], '1')
        self.assertEqual(popen.call_args.kwargs['env']['CI'], '1')
        self.assertEqual(popen.call_args.kwargs['stdin'], wifi.subprocess.DEVNULL)
        self.assertEqual(next(call.args[0] for call in run.call_args_list if 'up' in call.args[0])[-7:],
                         ['up', '-d', '--build', '--wait', '--wait-timeout', '180', 'app'])

    def test_mqtt_cannot_silently_fall_back_to_http(self):
        wifi.validate_transport({})
        wifi.validate_transport({'DEVICE_TRANSPORT': 'http'})
        for env in ({'DEVICE_TRANSPORT': 'mqtt'}, {'MQTT_PASSWORD': 'fixture'}, {'MQTT_URL': 'tcp://broker'}, {'COMPOSE_FILE': 'docker-compose.mqtt.yaml'}):
            with self.assertRaisesRegex(ValueError, 'solo soporta HTTP'):
                wifi.validate_transport(env)

    def test_existing_unowned_project_is_never_reused(self):
        wifi.validate_project([])
        wifi.validate_project([{'com.plantclassifier.wifi-launcher': 'http-v1'}])
        for container in ({}, {'com.docker.compose.project': 'plantclassifier-lab'}, None):
            with self.assertRaisesRegex(ValueError, 'ajenos'):
                wifi.validate_project([container])

    def test_preflight_rejects_env_file_mqtt_and_foreign_project_before_up(self):
        import json
        from types import SimpleNamespace
        config = {'services': {'app': {'ports': [{'host_ip': '192.168.2.8', 'target': 8080, 'published': '18081'}]}}}
        for mode in ('mqtt-env-file', 'foreign-project', 'foreign-volume'):
            def result(command, **kwargs):
                if command[-2:] == ['--format', 'json']: return SimpleNamespace(stdout=json.dumps(config))
                if command[-1] == '--environment': return SimpleNamespace(stdout='DEVICE_TRANSPORT=mqtt' if mode == 'mqtt-env-file' else '')
                if command[:2] == ['docker', 'ps']: return SimpleNamespace(stdout='fixture-container' if mode == 'foreign-project' else '')
                if command[:2] == ['docker', 'inspect']: return SimpleNamespace(stdout='{}')
                if command[:3] == ['docker', 'volume', 'ls']: return SimpleNamespace(stdout='fixture-volume')
                if command[:3] == ['docker', 'volume', 'inspect']: return SimpleNamespace(stdout='{}')
                raise AssertionError('Mutation attempted before validation')
            with self.subTest(mode=mode), patch.object(wifi.sys, 'argv', ['start-wifi.py']), patch.dict(wifi.os.environ, {}, clear=True), patch.object(wifi.shutil, 'which', return_value='/usr/bin/tool'), patch.object(wifi.Path, 'exists', return_value=True), patch.object(wifi, 'networks', return_value=[('wlp2s0', '192.168.2.8', 24)]), patch.object(wifi, 'connection_name', return_value='Lab'), patch('builtins.print'), patch.object(wifi, 'run', side_effect=result) as run:
                with self.assertRaises(ValueError): wifi.main()
                self.assertFalse(any('up' in call.args[0] or 'stop' in call.args[0] for call in run.call_args_list))

    def test_network_filter_rejects_public_loopback_and_virtual(self):
        import json
        from types import SimpleNamespace
        links = [{'ifname': name, 'addr_info': [{'local': ip, 'prefixlen': 24, 'scope': 'global'}]} for name, ip in
                 [('wlp2s0', '192.168.2.8'), ('eth0', '8.8.8.8'), ('lo', '127.0.0.1'), ('docker0', '172.17.0.1'), ('tun0', '10.1.2.3')]]
        with patch.object(wifi, 'run', return_value=SimpleNamespace(stdout=json.dumps(links))), patch.object(wifi.Path, 'exists', lambda path: path.parts[-2] in ('wlp2s0', 'eth0')):
            self.assertEqual(wifi.networks(), [('wlp2s0', '192.168.2.8', 24)])


if __name__ == '__main__':
    unittest.main()
