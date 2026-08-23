#include <WiFi.h> // Wifi of the ESP32
#include <HTTPClient.h>  // Http methods (Get, post, ...)
#include <ArduinoJson.h> // Allow us to work with JSON using the ESP32
#include <WebServer.h>

/* Code for the sensor */
// #include <DHT.h>

// #define DHTPIN 4
// #define DHTTYPE DHT11

// DHT dht(DHTPIN, DHTTYPE);


/* ================= */
// Configuration of the red
#define WIFI_SSID "L@nde01"
#define WIFI_PASSWORD "M1gat0l0c02@"

// Server URL
const char* serverURL = "http://192.168.100.5:8080/sensors";

/*  Server ESP32  */
WebServer server(80);


// Method getSensorJSON
String getSensorJSON() {

    // Read the sensors
    float temperature = 15;
    float humidity = 16;
    float ph = 20.0;

    // Create JSON
    JsonDocument doc;

    doc["ph"] = ph;
    doc["temperature"] = temperature;
    doc["humidity"] = humidity;

    String json;
    serializeJson(doc, json);

    return json;
}


// Method CaptureData
void captureData() {

    // Read the sensors and create JSON
    String json = getSensorJSON();

    Serial.println("Capture requested!");
    Serial.println("Sensor data:");
    Serial.println(json);


    // Send the JSON back to whoever requested /capture
    server.send(200, "application/json", json);
}


/* ============================= */
void setup() {

    Serial.begin(115200);

    // dht.begin();

    /*     Connect ESP32 to Wifi    */

    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    Serial.print("Connecting to Wi-Fi");

    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }

    Serial.println();
    Serial.println("Connected!");

    Serial.print("ESP32 IP: ");
    Serial.println(WiFi.localIP());

    /* ================================ */


    /*  Activate the server  */

    server.on("/capture", HTTP_GET, captureData);

    server.begin();

    Serial.println("HTTP server started");

    /* ================================ */
}


void loop() {

    /*     Listen for requests     */

    server.handleClient();

    /* ================================ */
}