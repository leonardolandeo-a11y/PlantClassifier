"""Contract and functional checks for the synthetic four-feature model."""
import os
import tempfile
from pathlib import Path
import unittest
import joblib
import numpy as np
import pandas as pd
from predict import predict, OutOfDomainError
from features import FEATURES, LABELS, MODEL_VERSION
from train import evaluate

ROOT = Path(__file__).parent
MODEL = Path(os.environ.get('PLANT_MODEL_TEST_PATH', ROOT / 'model.pkl'))

class PipelineTest(unittest.TestCase):
    def test_dataset_and_model(self):
        frame = pd.read_csv(ROOT / 'Data.csv')
        self.assertEqual(list(frame.columns), FEATURES + ['label'])
        self.assertGreaterEqual(len(frame), 11000)
        self.assertEqual(set(frame.label), set(LABELS))
        self.assertFalse(frame.isna().any().any())
        self.assertTrue(np.isfinite(frame[FEATURES]).all().all())
        self.assertEqual(int(frame.duplicated(FEATURES).sum()), 0)
        model = joblib.load(MODEL)
        self.assertEqual(list(model.feature_names_in_), FEATURES)
        self.assertEqual(model.n_features_in_, 4)
        self.assertEqual(model.plant_model_version, MODEL_VERSION)
        self.assertEqual(set(model.classes_), set(LABELS))
        self.assertEqual(list(model.plant_feature_bounds), FEATURES)
        for label in LABELS:
            values = frame[frame.label == label][FEATURES].median().tolist()
            self.assertIn(predict(values, MODEL), LABELS)
        self.assertIn(predict([25,60,6.5,55], MODEL), LABELS)

    def test_soil_changes_actual_model_probabilities_and_can_change_class(self):
        model = joblib.load(MODEL)
        self.assertGreater(model.feature_importances_[3], 0)
        frame = pd.read_csv(ROOT / 'Data.csv')
        changed = False
        for _, row in frame.sample(100,random_state=42).iterrows():
            dry = row[FEATURES].astype(float).tolist(); wet = dry.copy()
            dry[3], wet[3] = 25, 85
            x = pd.DataFrame([dry,wet],columns=FEATURES)
            if model.predict(x)[0] != model.predict(x)[1]:
                changed = True
                self.assertFalse(np.array_equal(*model.predict_proba(x)))
                self.assertNotEqual(predict(dry,MODEL), predict(wet,MODEL))
                break
        self.assertTrue(changed, 'Measured soil sensitivity expected; do not force classes')

    def test_rejects_incomplete_out_of_range_and_old_model(self):
        for values in [[],[25,60,7],[25,60,7,None],[25,60,7,float('nan')],[25,60,7,101],[-1,60,7,45]]:
            with self.assertRaises((ValueError, TypeError)):
                predict(values,MODEL)
        with self.assertRaises(ValueError):
            predict([25,60,7,45], ROOT / 'model.previous-3-features.pkl')

    def test_abstains_outside_training_domain_without_clipping(self):
        for values in [[26.7,68.4,9.1,58], [26.7,68.4,6.5,0], [26.7,68.4,6.5,100],
                       [40,60,6.5,55], [25,90,6.5,55]]:
            with self.assertRaises(OutOfDomainError): predict(values, MODEL)
        self.assertIn(predict([26.7,68.4,6.5,58], MODEL), LABELS)

    def test_domain_metadata_matches_training_partition(self):
        from sklearn.model_selection import train_test_split
        frame = pd.read_csv(ROOT/'Data.csv')
        train, _ = train_test_split(frame,test_size=.2,stratify=frame.label,random_state=42)
        model = joblib.load(MODEL)
        self.assertEqual(model.plant_feature_bounds, {f:[float(train[f].min()),float(train[f].max())] for f in FEATURES})

    def test_evaluation_reproducible(self):
        with tempfile.TemporaryDirectory() as directory:
            first = evaluate(ROOT/'Data.csv',Path(directory)/'a.json')
            second = evaluate(ROOT/'Data.csv',Path(directory)/'b.json')
            self.assertEqual(first,second)
            self.assertGreater(first['permutation_importance']['soilMoisture'],0)

    def test_training_rejects_conflicting_labels(self):
        frame = pd.read_csv(ROOT/'Data.csv')
        duplicate = frame.iloc[[0]].copy()
        duplicate['label'] = next(label for label in LABELS if label != duplicate.iloc[0].label)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'data.csv'
            pd.concat([frame,duplicate]).to_csv(path,index=False)
            with self.assertRaises(ValueError): evaluate(path,Path(directory)/'report.json')

if __name__ == '__main__': unittest.main()
