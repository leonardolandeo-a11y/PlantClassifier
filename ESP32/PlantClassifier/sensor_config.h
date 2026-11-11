#pragma once
// Dedicated physical inputs. Legacy local simulation flags do not change this sketch.
#define DHTPIN 21
#define DHTTYPE DHT11
constexpr int PH_PIN = 34;
constexpr int PH_ADC_BITS = 12;
constexpr int PH_ADC_MAX = (1 << PH_ADC_BITS) - 1;
constexpr unsigned long SENSOR_INTERVAL_MS = 2000;

constexpr int SOIL_PIN = 35;
// Replace only after physical wiring verification and dry/wet reference measurements.
constexpr int SOIL_DRY_RAW = 2686;
constexpr int SOIL_WET_RAW = 1100 ;
