"""Evaluate reproducibly. Never replace the deployed model automatically."""
import argparse
import hashlib
import json
from pathlib import Path
import joblib
import pandas as pd
import sklearn
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, confusion_matrix, classification_report
from sklearn.model_selection import train_test_split
from features import FEATURES, SEED, LABELS, BOUNDS, MODEL_VERSION, FOREST_PARAMETERS
from sklearn.inspection import permutation_importance


def evaluate(dataset, report_path, candidate=None):
    frame = pd.read_csv(dataset)
    if list(frame.columns) != FEATURES + ["label"] or len(frame) < 11000 or set(frame["label"]) != set(LABELS):
        raise ValueError("Expected 11000+ rows, four features and exactly five crops")
    for feature, (low, high) in zip(FEATURES, BOUNDS):
        frame[feature] = pd.to_numeric(frame[feature], errors="raise")
        if not frame[feature].between(low, high).all():
            raise ValueError("Out-of-range feature: " + feature)
    if frame[FEATURES + ["label"]].isna().any().any():
        raise ValueError("Missing training values")
    import numpy as np
    if not np.isfinite(frame[FEATURES].to_numpy()).all():
        raise ValueError("Non-finite training values")
    duplicates = int(frame.duplicated(subset=FEATURES).sum())
    # Keep identical feature vectors in only one partition; reject contradictory labels.
    if (frame.groupby(FEATURES)["label"].nunique() > 1).any():
        raise ValueError("Identical features carry conflicting labels")
    clean = frame.drop_duplicates(subset=FEATURES)
    counts = clean["label"].value_counts().sort_index()
    if counts.min() < 2:
        raise ValueError("Insufficient examples for stratified evaluation")
    train, test = train_test_split(clean, test_size=0.2, random_state=SEED, stratify=clean["label"])
    model = RandomForestClassifier(**FOREST_PARAMETERS, random_state=SEED, n_jobs=2)
    model.fit(train[FEATURES], train["label"])
    model.plant_model_version = MODEL_VERSION
    model.plant_feature_bounds = {f: [float(train[f].min()), float(train[f].max())] for f in FEATURES}
    predicted = model.predict(test[FEATURES])
    labels = sorted(clean["label"].unique().tolist())
    metrics = {}
    for average in ["macro", "weighted"]:
        precision, recall, f1, _ = precision_recall_fscore_support(test["label"], predicted, average=average, zero_division=0)
        metrics[average] = {"precision": float(precision), "recall": float(recall), "f1": float(f1)}
    importance = permutation_importance(model, test[FEATURES], test["label"], n_repeats=5, random_state=SEED, n_jobs=2)
    # Deliberately harder extrapolation stress test, not a recovered generation-group split.
    threshold = clean.groupby("label")["soilMoisture"].transform(lambda x: x.quantile(.8))
    upper = clean["soilMoisture"] >= threshold
    stress_model = RandomForestClassifier(**FOREST_PARAMETERS, random_state=SEED, n_jobs=2)
    stress_model.fit(clean.loc[~upper, FEATURES], clean.loc[~upper, "label"])
    stress_prediction = stress_model.predict(clean.loc[upper, FEATURES])
    report = {
        "model_version": MODEL_VERSION, "synthetic": True,
        "parameters": FOREST_PARAMETERS, "inference_bounds": model.plant_feature_bounds,
        "ranges": {f: [float(clean[f].min()), float(clean[f].max())] for f in FEATURES},
        "per_crop": classification_report(test["label"], predicted, output_dict=True, zero_division=0),
        "permutation_importance": dict(zip(FEATURES, importance.importances_mean.tolist())),
        "soil_upper_tail_stress": {"accuracy": accuracy_score(clean.loc[upper,"label"], stress_prediction),
            "report": classification_report(clean.loc[upper,"label"], stress_prediction, output_dict=True, zero_division=0)},
        "dataset_sha256": hashlib.sha256(Path(dataset).read_bytes()).hexdigest(),
        "sklearn_version": sklearn.__version__, "seed": SEED, "features": FEATURES,
        "rows": len(frame), "duplicate_features_removed": duplicates,
        "train_rows": len(train), "test_rows": len(test), "class_distribution": {str(k): int(v) for k, v in counts.items()},
        "accuracy": accuracy_score(test["label"], predicted), **metrics,
        "labels": labels, "confusion_matrix": confusion_matrix(test["label"], predicted, labels=labels).tolist(),
        "limitations": "Synthetic range-generated data; no generation-group metadata. Random split estimates interpolation only. Upper soil tail holdout is a stress test, not field validation. Relative resistive scale is assumed by the demonstration, not scientifically calibrated to the generating ranges. Candidate is trained on 80% only; test rows are never refitted."
    }
    if candidate:
        path = Path(candidate).resolve()
        if path == Path(__file__).with_name("model.pkl").resolve() or path.exists():
            raise ValueError("Candidate path must be new and must not replace model.pkl")
        joblib.dump(model, path, compress=3)
        reloaded = joblib.load(path)
        if not (reloaded.predict(test[FEATURES]) == predicted).all():
            raise ValueError("Candidate round-trip predictions changed")
        report["candidate_bytes"] = path.stat().st_size
    Path(report_path).write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"accuracy": report["accuracy"], "macro": metrics["macro"], "train_rows": len(train), "test_rows": len(test)}, ensure_ascii=False))
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, default=Path(__file__).with_name("Data.csv"))
    parser.add_argument("--report", type=Path, default=Path(__file__).with_name("evaluation.json"))
    parser.add_argument("--candidate", type=Path)
    args = parser.parse_args()
    evaluate(args.dataset, args.report, args.candidate)
