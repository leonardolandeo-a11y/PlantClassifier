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
  Dht dht;
  SensorSample sample;
  int calls = 0;
  assert(readSensors(dht, [&](int pin) { assert(pin == 34); ++calls; return 2048; }, sample));
  assert(calls == 8 && dht.reads == 2);
  assert(sample.temperature == 25 && sample.humidity == 60 && fabs(sample.ph - 7) < .01);
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
