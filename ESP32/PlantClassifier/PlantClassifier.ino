#include <WiFi.h>
#include <ArduinoJson.h>
#include <WebServer.h>
#include <DHT.h>

// ============================================================
// WIFI CONFIGURATION
// ============================================================


WebServer server(80);
#include "control_protocol.h"

// ============================================================
// SENSOR CONFIGURATION
// ============================================================

#define DHTPIN 22
#define DHTTYPE DHT11

#define PHPIN 34
#define TEMPPIN 35

DHT dht(DHTPIN, DHTTYPE);
String simulatedCommand = "STOP";
void robotStop() { simulatedCommand = "STOP"; }
#ifndef REAL_SENSOR_MODE
#define REAL_SENSOR_MODE 0
#endif

// ============================================================
// SENSOR DATA
// ============================================================

String getSensorJSON() {

    float rawTemperature = analogRead(TEMPPIN);
    float rawPH = analogRead(PHPIN);

    float ph = round((rawPH / 4095.0) * 14.0);

    // Simulated sensor values
    float temperature = round(
        (rawTemperature / 4095.0) * 35.0
    );

    float humidity = round(
        (
            (rawTemperature / 4095.0) * 100.0 +
            (rawPH / 4095.0) * 100.0
        ) / 2.0
    );

#if REAL_SENSOR_MODE
    // Real pH requires a calibrated analog interface. Values are supplied in local wifi_config.h.
#ifndef PH_ADC_AT_7
#error "Calibrate PH_ADC_AT_7 and PH_ADC_AT_4 before enabling real sensor mode"
#endif
#ifndef PH_ADC_AT_4
#error "Calibrate PH_ADC_AT_4 before enabling real sensor mode"
#endif
    temperature = dht.readTemperature();
    humidity = dht.readHumidity();
    ph = 7.0f + (rawPH - PH_ADC_AT_7) * (4.0f - 7.0f) / (PH_ADC_AT_4 - PH_ADC_AT_7);
    if (!isfinite(temperature) || !isfinite(humidity) || !isfinite(ph) || ph < 0 || ph > 14 ||
        humidity < 0 || humidity > 100) return "";
#endif
    JsonDocument doc;
    doc["simulated"] = !REAL_SENSOR_MODE;
    doc["ph"] = ph;
    doc["temperature"] = temperature;
    doc["humidity"] = humidity;

    String json;
    serializeJson(doc, json);

    return json;
}

// ============================================================
// GET /capture
// ============================================================

void captureData() {

    if (!authorized()) return;
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
    response["speed"] = command == "STOP" ? 0 : speed;
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

    dht.begin();

    // WiFi
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    Serial.print("Connecting to WiFi");

    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }

    Serial.println();
    Serial.println("WiFi connected!");

    Serial.print("ESP32 IP: ");
    Serial.println(WiFi.localIP());

    configureControl();
    // HTTP endpoints
    server.on("/capture", HTTP_GET, captureData);

    server.on("/movement", HTTP_POST, handleMovement);

    server.on("/status", HTTP_GET, handleStatus);

    server.begin();

    Serial.println("HTTP Server Started!");
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
    if (WiFi.status() == WL_CONNECTED) server.handleClient();
}