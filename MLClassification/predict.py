import sys
import joblib
import pandas as pd

model = joblib.load("model.pkl")

temperature = float(sys.argv[1])
humidity = float(sys.argv[2])
ph = float(sys.argv[3])

data = pd.DataFrame([{
    "temperature": temperature,
    "humidity": humidity,
    "ph": ph
}])

prediction = model.predict(data)

print(prediction[0])