#!/usr/bin/env python3
"""Summarize DEBUG metric lines from Spring, without connecting to devices."""
import json
import re
import sys
from collections import defaultdict
from importlib.machinery import SourceFileLoader
from pathlib import Path
summary = SourceFileLoader('latency', str(Path(__file__).with_name('diagnose-latency.py'))).load_module().summary
values = defaultdict(list)
for line in sys.stdin:
    match = re.search(r'metric=([\w-]+) elapsedMs=([\d.]+)', line)
    if match:
        values[match[1]].append(float(match[2]))
print(json.dumps({k: summary(v, len(v)) for k, v in values.items()}, indent=2))
