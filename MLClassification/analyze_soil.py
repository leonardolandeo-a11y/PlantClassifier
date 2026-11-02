"""Reproducible, offline diagnosis. Never promotes a model or changes the dataset.

Probabilities below are RAW model outputs, including deliberately unsupported inputs.
They are diagnostic counterfactuals, not estimates of agricultural suitability.
"""
import argparse
import hashlib
import itertools
import json
from pathlib import Path
import shutil

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.metrics import accuracy_score, classification_report, log_loss
from sklearn.model_selection import train_test_split
from features import FEATURES, LABELS, MODEL_VERSION, SEED

SOIL = [0, 10, 20, 30, 40, 50, 58, 60, 70, 80, 90, 100]
PH = [9.1, 5.8, 6.2, 6.5, 6.8, 7.2]
# One prespecified regularization hypothesis; no search on the held-out test set.
CANDIDATE = dict(n_estimators=200, min_samples_leaf=5)
GATES = dict(max_accuracy_loss=.01, max_macro_f1_loss=.01,
             min_upper_tail_gain=.05, max_lower_tail_loss=.01,
             max_per_crop_f1_loss=.03, max_brier_increase=0)


def fit(frame, parameters=None, features=FEATURES):
    model = RandomForestClassifier(random_state=SEED, n_jobs=2,
                                   **(parameters or dict(n_estimators=100)))
    model.fit(frame[features], frame.label)
    return model


def metrics(model, frame, features=FEATURES):
    p = model.predict_proba(frame[features])
    y = frame.label.to_numpy()
    pred = model.classes_[p.argmax(axis=1)]
    hot = y[:, None] == model.classes_[None, :]
    confidence = p.max(axis=1)
    bins = []
    for lo in np.arange(0, 1, .1):
        mask = (confidence >= lo) & (confidence < lo+.1 if lo < .9 else confidence <= 1)
        if mask.any():
            bins.append(dict(low=float(lo), count=int(mask.sum()),
                             confidence=float(confidence[mask].mean()),
                             accuracy=float((pred[mask] == y[mask]).mean())))
    return dict(accuracy=accuracy_score(y, pred),
                classification=classification_report(y, pred, output_dict=True, zero_division=0),
                brier_multiclass_sum=float(np.mean(np.sum((p-hot)**2, axis=1))),
                log_loss=log_loss(y, p, labels=model.classes_),
                top_label_ece_10_bins=sum(b['count']*abs(b['confidence']-b['accuracy']) for b in bins)/len(y),
                reliability_bins=bins)


def sweep(model, frame, name):
    rows = []
    bounds = [(frame[f].min(), frame[f].max()) for f in FEATURES]
    for ph in PH:
        x = pd.DataFrame([[26.7, 68.4, ph, soil] for soil in SOIL], columns=FEATURES)
        probabilities = model.predict_proba(x)
        previous = None
        previous_winner = None
        for values, p in zip(x.to_numpy(), probabilities):
            winner = str(model.classes_[p.argmax()])
            row = dict(model=name, **dict(zip(FEATURES, values)), winner=winner,
                       outside_observed_domain=';'.join(f for f, v, (lo, hi) in zip(FEATURES, values, bounds) if not lo <= v <= hi),
                       class_changed=previous_winner is not None and winner != previous_winner,
                       total_variation_from_previous=None if previous is None else float(abs(p-previous).sum()/2))
            for label in LABELS:
                i = list(model.classes_).index(label)
                row['p_'+label] = float(p[i])
                row['delta_'+label] = None if previous is None else float(p[i]-previous[i])
            rows.append(row)
            previous, previous_winner = p, winner
    return rows


def analyze(output):
    root = Path(__file__).parent
    output.mkdir(parents=True, exist_ok=True)
    frame = pd.read_csv(root/'Data.csv')
    assert len(frame) == 11000 and list(frame.columns) == FEATURES+['label']
    assert frame.label.value_counts().to_dict() == {label: 2200 for label in LABELS}
    assert not frame.isna().any().any() and np.isfinite(frame[FEATURES]).all().all()
    assert not frame.duplicated(FEATURES).any()
    backup = output/'baseline.pkl'
    baseline_path = backup if backup.exists() else root/'model.pkl'
    model = joblib.load(baseline_path)
    assert list(model.feature_names_in_) == FEATURES and set(model.classes_) == set(LABELS)
    assert model.plant_model_version == 'synthetic-five-crops-v1'
    if not backup.exists():
        shutil.copyfile(root/'model.pkl', backup)
    train, test = train_test_split(frame, test_size=.2, stratify=frame.label, random_state=SEED)
    reproduced = fit(train)
    assert np.array_equal(model.predict_proba(frame[FEATURES]), reproduced.predict_proba(frame[FEATURES]))
    candidate = fit(train, CANDIDATE)
    candidate.plant_model_version = MODEL_VERSION
    candidate.plant_feature_bounds = {f: [float(train[f].min()), float(train[f].max())] for f in FEATURES}
    candidate_path = output/'candidate.v2.pkl'
    if candidate_path.exists():
        assert np.allclose(joblib.load(candidate_path).predict_proba(test[FEATURES]), candidate.predict_proba(test[FEATURES]), rtol=0, atol=1e-12)
    else:
        joblib.dump(candidate, candidate_path, compress=3)
    report = dict(seed=SEED, dataset_sha256=hashlib.sha256((root/'Data.csv').read_bytes()).hexdigest(),
                  model_sha256=hashlib.sha256(backup.read_bytes()).hexdigest(),
                  features=FEATURES, rows=len(frame), duplicates=0, missing=0,
                  candidate_parameters=CANDIDATE, acceptance_gates=GATES,
                  baseline=metrics(model, test), candidate=metrics(candidate, test))
    summary = frame.groupby('label')[FEATURES].describe(percentiles=[.05, .25, .5, .75, .95])
    summary.to_csv(output/'distributions.csv')
    correlations = []
    for name, part in [('all', frame), *list(frame.groupby('label'))]:
        for method in ['pearson', 'spearman']:
            corr = part[FEATURES].corr(method=method)
            for a, b in itertools.combinations(FEATURES, 2):
                correlations.append(dict(group=name, method=method, feature_a=a, feature_b=b, correlation=corr.loc[a, b]))
    pd.DataFrame(correlations).to_csv(output/'correlations.csv', index=False)
    overlaps = []
    histograms = []
    for f in FEATURES:
        edges = np.linspace(frame[f].min(), frame[f].max(), 21)
        distributions = {}
        for label in LABELS:
            counts, _ = np.histogram(frame.loc[frame.label == label, f], bins=edges)
            distributions[label] = counts/counts.sum()
            for i, count in enumerate(counts):
                histograms.append(dict(feature=f, label=label, low=edges[i], high=edges[i+1], count=int(count)))
        for a, b in itertools.combinations(LABELS, 2):
            overlaps.append(dict(feature=f, crop_a=a, crop_b=b,
                                 histogram_overlap=float(np.minimum(distributions[a], distributions[b]).sum())))
    pd.DataFrame(overlaps).to_csv(output/'overlap.csv', index=False)
    pd.DataFrame(histograms).to_csv(output/'histograms.csv', index=False)
    rows = sweep(model, frame, 'baseline')+sweep(candidate, frame, 'candidate')
    pd.DataFrame(rows).to_csv(output/'soil_sensitivity.csv', index=False)
    physical = pd.DataFrame([[26.7,68.4,9.1,0], [26.7,68.3,9.07,58], [26.7,67.8,9.11,100]], columns=FEATURES)
    physical['winner'] = model.predict(physical[FEATURES])
    for i, label in enumerate(model.classes_):
        physical['p_'+label] = model.predict_proba(physical[FEATURES])[:, i]
    physical.to_csv(output/'reported_captures.csv', index=False)
    importance = permutation_importance(model, test[FEATURES], test.label, n_repeats=10, random_state=SEED, n_jobs=2)
    report['importance'] = {f:dict(impurity=float(model.feature_importances_[i]),
                                   permutation_mean=float(importance.importances_mean[i]),
                                   permutation_std=float(importance.importances_std[i])) for i, f in enumerate(FEATURES)}
    report['ablation_without_soil'] = metrics(fit(train, features=FEATURES[:3]), test, FEATURES[:3])
    # Change only soil within each row's class-specific training 5th–95th percentile.
    # This is a diagnostic intervention; no counterfactual ground truth is available.
    sensitivity = {}
    for name, estimator in [('baseline', model), ('candidate', candidate)]:
        q = train.groupby('label').soilMoisture.quantile([.05,.95]).unstack()
        low, high = test[FEATURES].copy(), test[FEATURES].copy()
        low['soilMoisture'] = test.label.map(q[.05]); high['soilMoisture'] = test.label.map(q[.95])
        pl, ph = estimator.predict_proba(low), estimator.predict_proba(high)
        sensitivity[name] = dict(rows=len(test), class_change_fraction=float((pl.argmax(1)!=ph.argmax(1)).mean()),
                                 mean_total_variation=float(abs(pl-ph).sum(axis=1).mean()/2))
    report['soil_sensitivity_within_class_quantiles'] = sensitivity
    # Per-class tails reproduce the earlier stress test, but induce label-dependent shift.
    # A global cutoff supplements it without using labels to assign the test partition.
    masks = {
        'upper_tail': frame.soilMoisture >= frame.groupby('label').soilMoisture.transform(lambda x:x.quantile(.8)),
        'lower_tail': frame.soilMoisture <= frame.groupby('label').soilMoisture.transform(lambda x:x.quantile(.2)),
        'global_above_70': frame.soilMoisture > 70,
    }
    report['stress'] = {}
    for name, mask in masks.items():
        result = dict(train_rows=int((~mask).sum()), test_rows=int(mask.sum()),
                      test_class_counts=frame.loc[mask,'label'].value_counts().to_dict())
        for kind, parameters in [('baseline', None), ('candidate', CANDIDATE)]:
            result[kind] = metrics(fit(frame.loc[~mask], parameters), frame.loc[mask])
        report['stress'][name] = result
    b, c = report['baseline'], report['candidate']
    gates = dict(
        accuracy=c['accuracy'] >= b['accuracy']-GATES['max_accuracy_loss'],
        macro_f1=c['classification']['macro avg']['f1-score'] >= b['classification']['macro avg']['f1-score']-GATES['max_macro_f1_loss'],
        per_crop=all(c['classification'][k]['f1-score'] >= b['classification'][k]['f1-score']-GATES['max_per_crop_f1_loss'] for k in LABELS),
        brier=c['brier_multiclass_sum'] <= b['brier_multiclass_sum'],
        upper_tail=report['stress']['upper_tail']['candidate']['accuracy'] >= report['stress']['upper_tail']['baseline']['accuracy']+GATES['min_upper_tail_gain'],
        lower_tail=report['stress']['lower_tail']['candidate']['accuracy'] >= report['stress']['lower_tail']['baseline']['accuracy']-GATES['max_lower_tail_loss'])
    report['candidate_gate_results'] = gates
    report['candidate_passes_all_gates'] = all(gates.values())
    report['stability'] = []
    for seed in [17, 2026]:
        tr, te = train_test_split(frame, test_size=.2, stratify=frame.label, random_state=seed)
        splits = [('random', tr, te)]+[(name, frame.loc[~mask], frame.loc[mask]) for name, mask in masks.items() if name != 'global_above_70']
        for split, a, b in splits:
            for name, params in [('baseline', dict(n_estimators=100)), ('candidate', CANDIDATE)]:
                estimator = RandomForestClassifier(random_state=seed, n_jobs=2, **params).fit(a[FEATURES], a.label)
                m = metrics(estimator, b)
                report['stability'].append(dict(seed=seed, split=split, model=name, accuracy=m['accuracy'],
                                                f1_macro=m['classification']['macro avg']['f1-score']))
    report['limitations'] = 'Synthetic interpolation only. No field outcomes or generator groups; histogram overlap depends on bins. Marginal bounds do not prove joint support. Counterfactual changes have no suitability ground truth. ECE depends on binning. Brier/log loss measure discrimination and calibration together. No model promoted automatically.'
    (output/'analysis.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ['importance', 'soil_sensitivity_within_class_quantiles', 'candidate_gate_results']},ensure_ascii=False,indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    analyze(parser.parse_args().output)
