#include <initializer_list>
#include <cassert>
#include <cstdio>
#include "../PlantClassifier/sensor_inputs.h"
struct Dht {
  float temperature = 25, humidity = 60;
  int reads = 0;
  float readTemperature() { ++reads; return temperature; }
  float readHumidity() { ++reads; return humidity; }
};
int main() {
  assert(calibratedSoil(2000, 3000, 1000) == 50);
  assert(calibratedSoil(2000, 1000, 3000) == 50);
  assert(calibratedSoil(3500, 3000, 1000) == 0);
  assert(isnan(calibratedSoil(2000, -1, -1)));
  assert(isnan(calibratedSoil(2000, 1000, 1000)));
  assert(isnan(calibratedSoil(0, 3000, 1000)));
  assert(calibratedSoil(500, 3000, 1000) == 100);
  assert(calibratedSoil(500, 1000, 3000) == 0);
  assert(calibratedSoil(3500, 1000, 3000) == 100);
  assert(isnan(calibratedSoil(4095, 3000, 1000)));
  assert(isnan(calibratedSoil(2000, 5000, 1000)));
  Dht dht;
  SensorSample sample;
  int calls = 0;
  assert(readSensors(dht, [&](int pin) { assert(pin == 34 || pin == 35); ++calls; return 2048; }, sample));
  assert(calls == 16 && dht.reads == 2);
  assert(sample.temperature == 25 && sample.humidity == 60 && fabs(sample.ph - 7) < .01);
  assert(isnan(sample.soilMoisture));
  assert(readSensors(dht, [](int pin) { return pin == PH_PIN ? 1024 : 3000; }, sample));
  assert(sample.soilRaw == 3000 && fabs(sample.ph - 3.5) < .01 && sample.humidity == 60);
  assert(readSensors(dht, [](int pin) { return pin == PH_PIN ? 1024 : 0; }, sample));
  assert(sample.soilRaw == -1 && isnan(sample.soilMoisture) && sample.humidity == 60);
  for (int value : { -100, 0, 4095, 5000 }) {
    assert(readSensors(dht, [=](int) { return value; }, sample));
    assert(sample.ph == (value <= 0 ? 0 : 14));
  }
  for (float invalid : {NAN, INFINITY, -1.f, 51.f}) {
    dht.temperature = invalid;
    assert(!readSensors(dht, [](int) { assert(false); return 0; }, sample));
  }
  dht.temperature = 25;
  for (float invalid : {NAN, INFINITY, 19.f, 81.f}) {
    dht.humidity = invalid;
    assert(!readSensors(dht, [](int) { assert(false); return 0; }, sample));
  }
  puts("PASS physical acquisition: DHT, ADC, filtering, bounds, invalid readings");
}
