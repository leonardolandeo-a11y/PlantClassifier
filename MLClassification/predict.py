"""Single prediction CLI. stdout contains exactly one validated class label."""
import math
import json
from functools import lru_cache
from pathlib import Path
import sys
import joblib
import pandas as pd
from features import FEATURES, LABELS, BOUNDS, MODEL_VERSION


class OutOfDomainError(ValueError):
    """Finite sensor measurement outside this model's training envelope."""


@lru_cache(maxsize=1)
def load_model(path):
    return joblib.load(path)


def predict(values, model_path=None):
    if len(values) != 4 or not all(math.isfinite(value) and low <= value <= high for value, (low, high) in zip(values, BOUNDS)):
        raise ValueError("Four bounded finite sensor values required")
    model = load_model(model_path or Path(__file__).with_name("model.pkl"))
    if (list(model.feature_names_in_) != FEATURES or model.n_features_in_ != 4
            or set(model.classes_) != set(LABELS) or getattr(model, "plant_model_version", None) != MODEL_VERSION):
        raise ValueError("Model feature schema mismatch")
    bounds = getattr(model, "plant_feature_bounds", None)
    if not isinstance(bounds, dict) or list(bounds) != FEATURES:
        raise ValueError("Missing model training domain")
    for feature, value, (physical_low, physical_high) in zip(FEATURES, values, BOUNDS):
        low, high = bounds[feature]
        if not (math.isfinite(low) and math.isfinite(high) and physical_low <= low < high <= physical_high):
            raise ValueError("Invalid model training domain")
        if not low <= value <= high:
            # Never clip/impute a measurement or extrapolate a crop recommendation.
            raise OutOfDomainError("Outside training range: " + feature)
    prediction = str(model.predict(pd.DataFrame([values], columns=FEATURES))[0])
    if prediction not in model.classes_ or not prediction or len(prediction) > 64 or "\n" in prediction:
        raise ValueError("Invalid model prediction")
    return prediction


def worker():
    # One bounded JSON line in, one correlated response out. No automatic retry.
    while True:
        line = sys.stdin.readline(1025)
        if not line: return
        if len(line) > 1024 or not line.endswith("\n"):
            raise ValueError("Oversized worker request")
        request = json.loads(line)
        reply = {"id": request["id"]}
        try:
            reply.update(status="ok", prediction=predict(request["values"]))
        except OutOfDomainError:
            reply.update(status="out-of-domain")
        except Exception:
            reply.update(status="error")
        print(json.dumps(reply), flush=True)


if __name__ == "__main__" and sys.argv[1:] == ["--worker"]:
    try:
        worker()
    except Exception as error:
        print(f"Worker failed ({type(error).__name__})", file=sys.stderr)
        sys.exit(1)
elif __name__ == "__main__":
    try:
        print(predict([float(value) for value in sys.argv[1:]]))
    except OutOfDomainError:
        print("Outside model training domain", file=sys.stderr)
        sys.exit(2)
    except Exception as error:
        # Never echo input arguments, environment, or potentially sensitive file paths.
        print(f"Prediction failed ({type(error).__name__})", file=sys.stderr)
        sys.exit(1)
