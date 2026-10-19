from pathlib import Path
sensor = Path('ESP32/PlantClassifier/PlantClassifier.ino').read_text()
movement = Path('ESP32/Movement/Movement.ino').read_text()
assert '"/movement"' not in sensor and '"/control-session"' not in sensor
assert '"/capture"' not in movement and 'simulated_capture' not in movement
assert 'dht.begin()' in sensor and 'analogRead(pin)' in sensor
for source in ('temperatureSource', 'humiditySource', 'phSource'):
    assert source in sensor
for path in Path('ESP32/PlantClassifier').glob('*'):
    if path.name == 'wifi_config.h': continue
    assert 'command_gate' not in path.read_text() and 'robotStop' not in path.read_text()
print('PASS dedicated firmware roles and source JSON fields')
