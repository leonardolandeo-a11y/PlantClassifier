#include <WiFi.h>
#include <ArduinoJson.h>
#include <WebServer.h>
#include "wifi_config.h"
#include "simulation_config.h"
#if !SIMULATION_MODE
#error "PlantClassifier sketch supports simulated movement only; use Movement for real actuators"
#endif
#if !SENSOR_SIMULATION_MODE
#include <DHT.h>
#endif

// ============================================================
// WIFI CONFIGURATION
// ============================================================


WebServer server(80);
#include "control_protocol.h"
#include "simulated_capture.h"

// ============================================================
// SENSOR CONFIGURATION
// ============================================================

#define DHTPIN 22
#define DHTTYPE DHT11

#define PHPIN 34
#define TEMPPIN 35

#if !SENSOR_SIMULATION_MODE
DHT dht(DHTPIN, DHTTYPE);
#endif
String simulatedCommand = "STOP";
void robotStop() { simulatedCommand = "STOP"; }

// ============================================================
// SENSOR DATA
// ============================================================

String getSensorJSON() {

#if SENSOR_SIMULATION_MODE
    return "{\"ph\":6.5,\"temperature\":25.0,\"humidity\":60.0,\"simulated\":true}";
#else
    float rawPH = analogRead(PHPIN);
    float temperature, humidity, ph;
    // Real pH requires a calibrated analog interface. Values are supplied in local wifi_config.h.
#ifndef PH_ADC_AT_7
#error "Calibrate PH_ADC_AT_7 and PH_ADC_AT_4 before enabling real sensor mode"
#endif
#ifndef PH_ADC_AT_4
#error "Calibrate PH_ADC_AT_4 before enabling real sensor mode"
#endif
    static_assert(PH_ADC_AT_4 != PH_ADC_AT_7, "pH calibration points must differ");
    temperature = dht.readTemperature();
    humidity = dht.readHumidity();
    ph = 7.0f + (rawPH - PH_ADC_AT_7) * (4.0f - 7.0f) / (PH_ADC_AT_4 - PH_ADC_AT_7);
    if (!isfinite(temperature) || !isfinite(humidity) || !isfinite(ph) || ph < 0 || ph > 14 ||
        humidity < 0 || humidity > 100 || temperature < -40 || temperature > 85) return "";
    JsonDocument doc;
    doc["simulated"] = false;
    doc["ph"] = ph;
    doc["temperature"] = temperature;
    doc["humidity"] = humidity;

    String json;
    serializeJson(doc, json);

    return json;
#endif
}

// ============================================================
// GET /capture
// ============================================================

void captureData() {

    if (!authorized()) return;
#if SENSOR_SIMULATION_MODE
    simulatedCapture(); return;
#endif
    String json = getSensorJSON();
    if (json.isEmpty()) { protocolError(503, "Sensor read failed or pH calibration invalid"); return; }

    Serial.println();
    Serial.println("========== SENSOR CAPTURE ==========");
    Serial.println(json);
    Serial.println("====================================");

    server.send(
        200,
        "application/json",
        json
    );
}

// ============================================================
// POST /movement
// SIMULATION ONLY - NO MOTORS
// ============================================================

void handleMovement() {

    JsonDocument doc;
    String command;
    int speed;
    if (!readCommand(doc, command, speed)) return;
    simulatedCommand = command;

    // ========================================================
    // PRINT COMMAND TO SERIAL MONITOR
    // ========================================================

    Serial.println();
    Serial.println("========== MOVEMENT REQUEST ==========");

    Serial.print("Command: ");
    Serial.println(command);

    Serial.print("Speed: ");
    Serial.println(speed);

    if (command == "FORWARD") {
        Serial.println("SIMULATION commanded: forward");
    }
    else if (command == "BACKWARD") {
        Serial.println("SIMULATION commanded: backward");
    }
    else if (command == "LEFT") {
        Serial.println("SIMULATION commanded steering: left");
    }
    else if (command == "RIGHT") {
        Serial.println("SIMULATION commanded steering: right");
    }
    else if (command == "CENTER") {
        Serial.println("SIMULATION commanded: Centering steering");
    }
    else if (command == "STOP") {
        Serial.println("SIMULATION commanded: Stopping robot");
    }

    Serial.println("======================================");

    // ========================================================
    // HTTP RESPONSE
    // ========================================================

    JsonDocument response;

    response["status"] = "OK";
    response["sessionId"] = controllerSession;
    response["sequence"] = doc["sequence"].as<uint32_t>();
    response["command"] = command;
    response["speed"] = (command == "FORWARD" || command == "BACKWARD") ? speed : 0;
    response["simulated"] = true;

    String jsonResponse;
    serializeJson(response, jsonResponse);

    server.send(
        200,
        "application/json",
        jsonResponse
    );
}

// ============================================================
// GET /status
// ============================================================

void handleStatus() {
    if (!authorized()) return;

    JsonDocument response;

    response["status"] = "online";
    response["ip"] = WiFi.localIP().toString();
    response["mode"] = "simulation";
    response["simulated"] = true;
    response["hardwareOutputEnabled"] = false;
    response["sensorSimulated"] = bool(SENSOR_SIMULATION_MODE);
    response["controlActive"] = gate.active;
    response["command"] = simulatedCommand;

    String json;
    serializeJson(response, json);

    server.send(
        200,
        "application/json",
        json
    );
}

// ============================================================
// SETUP
// ============================================================

void setup() {

    Serial.begin(115200);

    Serial.println("[MODE] SIMULATION - HARDWARE OUTPUT DISABLED");
#if !SENSOR_SIMULATION_MODE
    dht.begin();
#endif

    // WiFi
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    Serial.print("Connecting to WiFi");

    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
        delay(500);
        Serial.print(".");
    }

    Serial.println();
    if (WiFi.status() == WL_CONNECTED) Serial.println("[WIFI] Connected");

    Serial.print("[WIFI] IP: ");
    Serial.println(WiFi.localIP());

    configureControl();
    // HTTP endpoints
    server.on("/capture", HTTP_GET, captureData);

    server.on("/movement", HTTP_POST, handleMovement);

    server.on("/status", HTTP_GET, handleStatus);

    server.begin();

    Serial.println("[HTTP] Server started");
    Serial.println("Available endpoints:");
    Serial.println("GET  /capture");
    Serial.println("POST /movement");
    Serial.println("GET  /status");
}

// ============================================================
// LOOP
// ============================================================

void loop() {

    checkControlSafety();
    static unsigned long lastReconnect = 0;
    if (WiFi.status() == WL_CONNECTED) server.handleClient();
    else if (millis() - lastReconnect >= 5000) { lastReconnect = millis(); WiFi.reconnect(); }
    delay(1);
}
