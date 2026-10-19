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
#include "sensor_http.h"
DHT dht(DHTPIN, DHTTYPE);
unsigned long lastSample = 0;
bool sampled = false;
bool sampleValid = false;
SensorSample sample;

void sources(JsonDocument& doc) {
  doc["temperatureSource"] = "dht11";
  doc["humiditySource"] = "dht11";
  doc["phSource"] = "potentiometer";
  doc["simulated"] = true; // pH represents a demonstration quantity.
}
void captureData() {
  if (!authorized()) return;
  unsigned long now = millis();
  if (!sampled || now - lastSample >= SENSOR_INTERVAL_MS) {
    sampled = true;
    lastSample = now;
    sampleValid = readSensors(dht, [](int pin) { return analogRead(pin); }, sample);
  }
  // A failed sample remains an error throughout the sampling interval.
  if (!sampleValid) { protocolError(503, "DHT11 read failed or outside rated range"); return; }
  JsonDocument doc;
  sources(doc);
  doc["temperature"] = sample.temperature;
  doc["humidity"] = sample.humidity;
  doc["ph"] = sample.ph;
  doc["sampleAgeMs"] = now - lastSample;
  String body;
  serializeJson(doc, body);
  server.send(200, "application/json", body);
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
  sources(doc);
  String body;
  serializeJson(doc, body);
  server.send(200, "application/json", body);
}
void setup() {
  Serial.begin(115200);
  dht.begin();
  analogReadResolution(PH_ADC_BITS);
  analogSetPinAttenuation(PH_PIN, ADC_11db);
  pinMode(PH_PIN, INPUT);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) delay(500);
  Serial.print("[SENSOR] IP: "); Serial.println(WiFi.localIP());
  const char* headers[] = {"X-Device-Token"};
  server.collectHeaders(headers, 1);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/capture", HTTP_GET, captureData);
  server.onNotFound([]() { protocolError(404, "Not found"); });
  server.begin();
}
void loop() {
  static unsigned long lastReconnect = 0;
  if (WiFi.status() == WL_CONNECTED) server.handleClient();
  else if (millis() - lastReconnect >= 5000) { lastReconnect = millis(); WiFi.reconnect(); }
  delay(1);
}
