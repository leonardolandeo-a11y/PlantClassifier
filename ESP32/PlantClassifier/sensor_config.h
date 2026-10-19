#pragma once
// Dedicated physical inputs. Legacy local simulation flags do not change this sketch.
#define DHTPIN 22
#define DHTTYPE DHT11
constexpr int PH_PIN = 34;
constexpr int PH_ADC_BITS = 12;
constexpr int PH_ADC_MAX = (1 << PH_ADC_BITS) - 1;
constexpr unsigned long SENSOR_INTERVAL_MS = 2000;
