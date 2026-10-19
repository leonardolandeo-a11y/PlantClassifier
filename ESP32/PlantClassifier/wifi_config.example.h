#pragma once
// Copy to wifi_config.h (ignored); configure only on your machine.
const char* WIFI_SSID = "YOUR_WIFI_NETWORK";
const char* WIFI_PASSWORD = "REPLACE_LOCALLY";
// Match backend DEVICE_TOKEN. Use at least 32 random characters.
const char* DEVICE_TOKEN = "REPLACE_WITH_RANDOM_DEVICE_TOKEN";
#define ENABLE_SELFTEST_ENDPOINT 0
// For SENSOR_SIMULATION_MODE=0 in PlantClassifier: measure stabilized ADC values using certified pH buffers.
// #define PH_ADC_AT_7 <measured ADC value>
// #define PH_ADC_AT_4 <measured ADC value>

// Keep these enabled for USB-only demonstrations. No motors or sensors required.
#define SIMULATION_MODE 1
#define SENSOR_SIMULATION_MODE 1
