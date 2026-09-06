import pandas as pd

import joblib
from sklearn.ensemble import RandomForestClassifier

# Load dataset
df = pd.read_csv("Data.csv")

X = df[["temperature", "humidity", "ph"]]

y = df["label"]

model = RandomForestClassifier(
    n_estimators=100,
    random_state=42
)

model.fit(X, y)


joblib.dump(model, "model.pkl")
