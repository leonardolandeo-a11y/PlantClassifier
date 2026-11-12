#!/usr/bin/env python3
"""Independent full-stack runs; stop on the first failure, never retry a failed case."""
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

root=Path(__file__).resolve().parents[1]
reports=Path(os.environ.get('PLANT_REPEAT_REPORT_DIR') or tempfile.mkdtemp(prefix='plant-e2e-repeat-'))
reports.mkdir(parents=True,exist_ok=True)
cases=[('http-1','http',False),('http-2','http',False),
       ('mqtt-1','mqtt',False),('mqtt-2','mqtt',False),('mqtt-3','mqtt',False),
       ('mqtt-load-1','mqtt',True),('mqtt-load-2','mqtt',True)]
results=[]
for name,transport,loaded in cases:
    env=dict(os.environ,PLANT_BROWSER_TRANSPORT=transport,PLANT_MQTT_DELAY_MS='150' if loaded else '0',
             PLANT_TEST_RENDERER_STALL='1' if loaded else '0')
    env.pop('PLANT_BENCHMARK_OUTPUT',None)
    with (reports/(name+'.log')).open('w') as log:
        result=subprocess.run([sys.executable,'scripts/test-browser.py'],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,timeout=600)
    results.append({'case':name,'exit_code':result.returncode,'isolated_postgres':True,'simulated_devices':True,
                    'normal_dispatch_delay_ms':150 if loaded else 0,'renderer_stall_ms':2200 if loaded else 0})
    (reports/'results.json').write_text(json.dumps({'date':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'cases':results,'retries':0},indent=2)+'\n')
    print(f'{name}: {"PASS" if result.returncode==0 else "FAIL"} — {reports/(name+".log")}',flush=True)
    if result.returncode: raise SystemExit(result.returncode)
print(f'PASS {len(cases)} independent browser runs; no retries. Report: {reports}',flush=True)
