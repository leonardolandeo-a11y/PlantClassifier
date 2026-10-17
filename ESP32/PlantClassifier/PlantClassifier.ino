#include <WiFi.h>
#include <ArduinoJson.h>
#include <WebServer.h>
#include <DHT.h>

// ============================================================
// WIFI CONFIGURATION
// ============================================================

#define WIFI_SSID "YOUR_WIFI_NAME"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

WebServer server(80);

// ============================================================
// SENSOR CONFIGURATION
// ============================================================

#define DHTPIN 22
#define DHTTYPE DHT11

#define PHPIN 34
#define TEMPPIN 35

DHT dht(DHTPIN, DHTTYPE);

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

    JsonDocument doc;

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

    String json = getSensorJSON();

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

    if (!server.hasArg("plain")) {

        server.send(
            400,
            "application/json",
            "{\"error\":\"Missing JSON body\"}"
        );

        return;
    }

    JsonDocument doc;

    DeserializationError error =
        deserializeJson(doc, server.arg("plain"));

    if (error) {

        server.send(
            400,
            "application/json",
            "{\"error\":\"Invalid JSON\"}"
        );

        return;
    }

    String command = doc["command"] | "";
    int speed = doc["speed"] | 150;

    command.toUpperCase();
    speed = constrain(speed, 0, 255);

    // Validate command
    if (
        command != "FORWARD" &&
        command != "BACKWARD" &&
        command != "LEFT" &&
        command != "RIGHT" &&
        command != "CENTER" &&
        command != "STOP"
    ) {

        server.send(
            400,
            "application/json",
            "{\"error\":\"Unknown command\"}"
        );

        return;
    }

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
        Serial.println("ACTION: Moving forward");
    }
    else if (command == "BACKWARD") {
        Serial.println("ACTION: Moving backward");
    }
    else if (command == "LEFT") {
        Serial.println("ACTION: Turning left");
    }
    else if (command == "RIGHT") {
        Serial.println("ACTION: Turning right");
    }
    else if (command == "CENTER") {
        Serial.println("ACTION: Centering steering");
    }
    else if (command == "STOP") {
        Serial.println("ACTION: Stopping robot");
    }

    Serial.println("======================================");

    // ========================================================
    // HTTP RESPONSE
    // ========================================================

    JsonDocument response;

    response["status"] = "OK";
    response["command"] = command;
    response["speed"] = speed;
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

    server.handleClient();
}