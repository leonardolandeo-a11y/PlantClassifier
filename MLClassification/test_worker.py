"""Exercise the real persisted model through the worker's bounded line protocol."""
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parent

class WorkerProtocolTest(unittest.TestCase):
    def test_correlated_requests_abstention_and_recovery(self):
        requests = [{'id':1,'values':[25,60,6.5,45]},
                    {'id':2,'values':[25,60,14,45]},
                    {'id':3,'values':[25,60,6.5,45]}]
        result = subprocess.run([sys.executable,str(ROOT/'predict.py'),'--worker'],
                                input=''.join(json.dumps(r)+'\n' for r in requests),
                                capture_output=True,text=True,timeout=15,check=True)
        replies = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertEqual([1,2,3],[r['id'] for r in replies])
        self.assertEqual(['ok','out-of-domain','ok'],[r['status'] for r in replies])
        self.assertEqual(replies[0]['prediction'],replies[2]['prediction'])
        self.assertIn(replies[0]['prediction'],['frijol','tomate','sandía','melón','lechuga'])

    def test_oversized_or_unterminated_input_exits_without_a_prediction(self):
        for value in ['x'*1025, '{"id":1,"values":[25,60,6.5,45]}']:
            result=subprocess.run([sys.executable,str(ROOT/'predict.py'),'--worker'],input=value,
                                  capture_output=True,text=True,timeout=15)
            self.assertNotEqual(result.returncode,0)
            self.assertEqual(result.stdout,'')
            self.assertNotIn(value,result.stderr)
