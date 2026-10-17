"""Check current source for embedded credentials without printing their values.
This targeted guard complements manual review; it is not a general secret scanner.
"""
import re
import subprocess
from pathlib import Path

paths = subprocess.check_output(["git", "ls-files", "--cached", "--others", "--exclude-standard"], text=True).splitlines()
failures = []
for name in paths:
    path = Path(name)
    if not path.is_file() or "__pycache__" in name:
        continue
    if name.endswith("wifi_config.h") or path.name == ".env":
        failures.append(name)
    if path.suffix == ".ino":
        text = path.read_text()
        if re.search(r'(?:#define\s+WIFI_(?:SSID|PASSWORD)\s+"|(?:WIFI_(?:SSID|PASSWORD)|password|ssid)\s*=\s*")', text):
            failures.append(name)
    if path.name == "application.properties" and re.search(r'datasource.password=\$\{[^}]+:', path.read_text()):
        failures.append(name)
if failures:
    raise SystemExit("Embedded credential configuration found in: " + ", ".join(sorted(set(failures))))
print("Current source credential checks passed (values never printed)")
