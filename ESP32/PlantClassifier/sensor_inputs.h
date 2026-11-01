#pragma once
#include <math.h>
#include "sensor_config.h"
// Dependency injection lets host tests exercise the actual acquisition path.
struct SensorSample { float temperature, humidity, ph; float soilMoisture = NAN; int soilRaw = -1; };
inline float calibratedSoil(int raw, int dry, int wet) {
  if (raw <= 0 || raw >= PH_ADC_MAX || dry < 0 || wet < 0 ||
      dry > PH_ADC_MAX || wet > PH_ADC_MAX || dry == wet) return NAN;
  float value = 100.0f * (raw - dry) / (wet - dry);
  return roundf(value < 0 ? 0 : value > 100 ? 100 : value);
}
inline float demoPH(int raw) {
  raw = raw < 0 ? 0 : raw > PH_ADC_MAX ? PH_ADC_MAX : raw;
  return raw * 14.0f / PH_ADC_MAX;
}
template<class Dht, class Adc>
bool readSensors(Dht& dht, Adc adc, SensorSample& sample) {
  sample.temperature = dht.readTemperature();
  sample.humidity = dht.readHumidity();
  if (!isfinite(sample.temperature) || !isfinite(sample.humidity) ||
      sample.temperature < 0 || sample.temperature > 50 ||
      sample.humidity < 20 || sample.humidity > 80) return false;
  long sum = 0;
  for (int i = 0; i < 8; ++i) {
    int rawValue = adc(PH_PIN);
    sum += rawValue < 0 ? 0 : rawValue > PH_ADC_MAX ? PH_ADC_MAX : rawValue;
  }
  sample.ph = demoPH(int((sum + 4) / 8));
  long soilSum = 0;
  bool valid = true;
  for (int i = 0; i < 8; ++i) {
    int raw = adc(SOIL_PIN);
    if (raw <= 0 || raw >= PH_ADC_MAX) valid = false;
    soilSum += raw;
  }
  sample.soilRaw = valid ? int((soilSum + 4) / 8) : -1;
  sample.soilMoisture = calibratedSoil(sample.soilRaw, SOIL_DRY_RAW, SOIL_WET_RAW);
  return true;
}
