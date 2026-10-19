#pragma once
#include <math.h>
#include "sensor_config.h"
// Dependency injection lets host tests exercise the actual acquisition path.
struct SensorSample { float temperature, humidity, ph; };
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
  return true;
}
