"""Shared synthetic demonstration model contract; order is mandatory."""
FEATURES = ["temperature", "humidity", "ph", "soilMoisture"]
LABELS = ["frijol", "tomate", "sandía", "melón", "lechuga"]
BOUNDS = [(0, 50), (0, 100), (0, 14), (0, 100)]
MODEL_VERSION = "synthetic-five-crops-v2"
FOREST_PARAMETERS = dict(n_estimators=200, min_samples_leaf=5)
SEED = 42
