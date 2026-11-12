"""Read-only local process benchmark. Never trains or replaces the model."""
import json, math, statistics, subprocess, sys, time, selectors
from pathlib import Path
root = Path(__file__).resolve().parents[1]
code = '''import time, resource, json
start=time.perf_counter()
import joblib, pandas
imports=time.perf_counter()
model=joblib.load('model.pkl')
loaded=time.perf_counter()
for _ in range(1): model.predict(pandas.DataFrame([[25,60,6.5,45]],columns=model.feature_names_in_))
end=time.perf_counter()
print(json.dumps({'imports_ms':(imports-start)*1000,'load_ms':(loaded-imports)*1000,'inference_ms':(end-loaded)*1000,'peak_rss_kib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}))
'''
samples=[]
for _ in range(20):
    start=time.perf_counter()
    result=subprocess.run([sys.executable,'-c',code],cwd=root/'MLClassification',check=True,capture_output=True,text=True,timeout=30)
    sample=json.loads(result.stdout); sample['total_ms']=(time.perf_counter()-start)*1000
    start=time.perf_counter()
    subprocess.run([sys.executable,'-c','pass'],check=True,capture_output=True,timeout=5)
    sample['interpreter_start_exit_ms']=(time.perf_counter()-start)*1000
    samples.append(sample)
def summary(key):
    values=sorted(s[key] for s in samples)
    return {'n':len(values),'p50':statistics.median(values),'p95':values[math.ceil(len(values)*.95)-1], 'p99':values[-1], 'max':values[-1], 'failures':0}
worker=subprocess.Popen([sys.executable,'predict.py','--worker'],cwd=root/'MLClassification',stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
worker_samples=[]
try:
    ready=selectors.DefaultSelector(); ready.register(worker.stdout,selectors.EVENT_READ)
    for index in range(101):
        start=time.perf_counter()
        worker.stdin.write(json.dumps({'id':index,'values':[25,60,6.5,45]})+'\n'); worker.stdin.flush()
        if not ready.select(30): raise TimeoutError('Worker response deadline')
        reply=json.loads(worker.stdout.readline())
        assert reply['id']==index and reply['status']=='ok'
        worker_samples.append((time.perf_counter()-start)*1000)
finally:
    worker.kill(); worker.wait(); ready.close()
warm=sorted(worker_samples[1:])
worker_summary={'n':len(warm),'cold_ms':worker_samples[0],'p50':statistics.median(warm),'p95':warm[94],'p99':warm[98],'max':warm[-1],'failures':0}
print(json.dumps({'worker_ms':worker_summary,'environment':'local Linux process; one inference per process, no device or network', 'summary':{k:summary(k) for k in samples[0]},'samples':samples},indent=2))
