import tempfile
from pathlib import Path
import unittest
from predict import predict
from features import FEATURES
from train import evaluate


class PipelineTest(unittest.TestCase):
    def test_deployed_model_and_feature_order(self):
        self.assertEqual(FEATURES, ["temperature", "humidity", "ph"])
        self.assertIsInstance(predict([25, 60, 7]), str)

    def test_missing_and_non_finite_inputs(self):
        for values in [[], [1, 2], [float("nan"), 50, 7], [20, float("inf"), 7]]:
            with self.assertRaises(ValueError):
                predict(values)

    def test_training_rejects_conflicting_labels(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "data.csv"
            path.write_text("temperature,humidity,ph,label\n20,50,7,a\n20,50,7,b\n")
            with self.assertRaises(ValueError):
                evaluate(path, Path(directory) / "report.json")


if __name__ == "__main__":
    unittest.main()
