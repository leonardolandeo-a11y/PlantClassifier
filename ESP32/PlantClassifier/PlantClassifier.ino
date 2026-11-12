#include <WiFi.h>
#include <ArduinoJson.h>
#include <WebServer.h>
#include <DHT.h>
#include "wifi_config.h"
#include "sensor_inputs.h"
#if !defined(CONFIG_IDF_TARGET_ESP32)
#error "Sensor GPIO34 ADC mapping requires a classic ESP32; verify your board"
#endif
WebServer server(80);
#include "transport.h"
#include "sensor_http.h"
#include "sensor_servo.h"
DHT dht(DHTPIN, DHTTYPE);
unsigned long lastSample = 0;
bool sampled = false;
bool sampleValid = false;
SensorSample sample;
char sampleBoot[33];
uint32_t sampleSequence = 0;

void sources(JsonDocument& doc) {
  doc["temperatureSource"] = "dht11";
  doc["humiditySource"] = "dht11";
  doc["soilMoistureSource"] = "resistive-analog";
  doc["phSource"] = "potentiometer";
  doc["simulated"] = true; // pH represents a demonstration quantity.
}
void captureData() {
  if (!authorized()) return;
  unsigned long now = millis();
  if (!sampled || now - lastSample >= SENSOR_INTERVAL_MS) {
    // DHT11 is synchronous. Never start a fresh acquisition during servo control;
    // retain fresh cached captures, otherwise report unavailable rather than stale data.
    servoTick();
    if (servoActive) { protocolError(409, "capture-deferred: release servo control before acquiring a fresh sample"); return; }
    sampled = true;
    ++sampleSequence;
    lastSample = now;
    sampleValid = readSensors(dht, [](int pin) { return analogRead(pin); }, sample);
  }
  // A failed sample remains an error throughout the sampling interval.
  if (!sampleValid) { protocolError(503, "DHT11 or pH ADC read failed or outside valid range"); return; }
  JsonDocument doc;
  sources(doc);
  doc["temperature"] = sample.temperature;
  doc["humidity"] = sample.humidity;
  doc["ph"] = sample.ph;
  doc["soilMoisture"] = nullptr;
  if (isfinite(sample.soilMoisture)) doc["soilMoisture"] = sample.soilMoisture;
  doc["soilRaw"] = sample.soilRaw;
  doc["soilStatus"] = sample.soilRaw < 0 ? "invalid" : isfinite(sample.soilMoisture) ? "calibrated" : "calibration-pending";
  doc["deviceId"] = "sensor"; // One sensor role per installation; boot nonce namespaces samples.
  char sampleId[48];
  snprintf(sampleId, sizeof(sampleId), "%s-%lu", sampleBoot, (unsigned long)sampleSequence);
  doc["sampleId"] = sampleId;
  doc["sampleAgeMs"] = uint32_t(millis() - lastSample);
  String body;
  serializeJson(doc, body);
  mqttReply(200, "application/json", body);
}
void handleStatus() {
  if (!authorized()) return;
  JsonDocument doc;
  doc["status"] = "online";
  doc["role"] = "sensor";
  doc["mode"] = "physical-sensors";
  doc["ip"] = WiFi.localIP().toString();
  doc["phLabel"] = "pH (potentiometer simulation)";
  doc["samplingIntervalMs"] = SENSOR_INTERVAL_MS;
  doc["uptimeMs"] = uint32_t(millis());
  doc["sampled"] = sampled; doc["sampleValid"] = sampleValid;
  if (sampled) doc["sampleAgeMs"] = uint32_t(millis() - lastSample);
  doc["servoActive"] = servoActive; doc["servoEpoch"] = servoEpoch;
  doc["servoAngle"] = sensorAngle; doc["servoDirection"] = sensorDirection;
  doc["soilRaw"] = sampled ? sample.soilRaw : -1;
  doc["soilCalibrated"] = SOIL_DRY_RAW >= 0 && SOIL_WET_RAW >= 0 && SOIL_DRY_RAW != SOIL_WET_RAW;
  sources(doc);
  String body;
  serializeJson(doc, body);
  mqttReply(200, "application/json", body);
}
void setup() {
  Serial.begin(115200);

  dht.begin();
  setupSensorServo();
  analogReadResolution(PH_ADC_BITS);
  analogSetPinAttenuation(PH_PIN, ADC_11db);
  pinMode(PH_PIN, INPUT);
  pinMode(SOIL_PIN, INPUT);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  // Generate the sample namespace with the Wi-Fi entropy source enabled.
  snprintf(sampleBoot, sizeof(sampleBoot), "%08lx%08lx%08lx%08lx", (unsigned long)esp_random(),
      (unsigned long)esp_random(), (unsigned long)esp_random(), (unsigned long)esp_random());
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) delay(500);
  Serial.print("[SENSOR] IP: "); Serial.println(WiFi.localIP());
  const char* headers[] = {"X-Device-Token"};
  server.collectHeaders(headers, 1);
  server.on("/servo", HTTP_GET, servoStatus);
  server.on("/servo", HTTP_POST, servoCommand);
  server.on("/servo-session", HTTP_POST, servoSession);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/capture", HTTP_GET, captureData);
  server.onNotFound([]() { protocolError(404, "Not found"); });
  server.begin();
  setupMqtt();
}
void loop() {
  tickMqtt();
  servoTick();
  static unsigned long lastReconnect = 0;

  if (WiFi.status() == WL_CONNECTED) {
    // Slow HTTP diagnostic clients must not stall MQTT actuator watchdogs.
    if (!MQTT_ENABLED || !servoActive) server.handleClient();
  } else if (millis() - lastReconnect >= 5000) {
    lastReconnect = millis();
    WiFi.reconnect();
  }

  servoTick(); // Enforce watchdog/interpolation immediately after synchronous HTTP work.
  delay(1);
}

void mqttStop() { servoExpire(); }
void mqttDispatch(const String& method, const String& path) {
  if (method == "POST" && path == "/servo-session") servoSession();
  else if (method == "POST" && path == "/servo") servoCommand();
  else if (method == "GET" && path == "/servo") servoStatus();
  else if (method == "GET" && path == "/status") handleStatus();
  else if (method == "GET" && path == "/capture") captureData();
  else protocolError(404, "Unknown MQTT operation");
}
