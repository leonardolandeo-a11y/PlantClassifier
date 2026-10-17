"""Single prediction CLI. stdout contains exactly one validated class label."""
import math
from pathlib import Path
import sys
import joblib
import pandas as pd
from features import FEATURES


def predict(values, model_path=None):
    if len(values) != 3 or not all(math.isfinite(value) for value in values):
        raise ValueError("Three finite sensor values required")
    model = joblib.load(model_path or Path(__file__).with_name("model.pkl"))
    if list(model.feature_names_in_) != FEATURES:
        raise ValueError("Model feature schema mismatch")
    prediction = str(model.predict(pd.DataFrame([values], columns=FEATURES))[0])
    if prediction not in model.classes_ or not prediction or len(prediction) > 64 or "\n" in prediction:
        raise ValueError("Invalid model prediction")
    return prediction


if __name__ == "__main__":
    try:
        print(predict([float(value) for value in sys.argv[1:]]))
    except Exception as error:
        # Never echo input arguments, environment, or potentially sensitive file paths.
        print(f"Prediction failed ({type(error).__name__})", file=sys.stderr)
        sys.exit(1)
