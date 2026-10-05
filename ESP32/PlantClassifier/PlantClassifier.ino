#include <WiFi.h> // Wifi of the ESP32
#include <ArduinoJson.h> // Allow us to work with JSON using the ESP32
#include <WebServer.h>
/*
Board:
    - ESP32
Library:
    - ArduinoJson
    - DHT sensor library by Adafruit
*/
/* Code for the sensor */
#include <DHT.h>

#define DHTPIN 22

#define DHTTYPE DHT11
#define PHPIN 34

/*Simulacion*/
#define TEMPPIN 35

/*==================*/

DHT dht(DHTPIN, DHTTYPE);
/* ================= */

// Configuration of the red
#define WIFI_SSID "Galaxy A05 6201"
#define WIFI_PASSWORD "contraseña2"



/*  Server ESP32  */
// Allow esp32 behave like a web server
// Port: 80
WebServer server(80);


// Method getSensorJSON
// This method just convert the type of the data
// Data -> JsonDocument -> String
String getSensorJSON() {

    // Read the sensors
    float rawTemperature = analogRead(TEMPPIN); // dht.readTemperature()
    // float humidity = 85; // dht.readHumidity()
    float rawPH = analogRead(PHPIN); // analogRead(PHPIN)
    float ph = round((rawPH/4095.0) * 14.0);

    /* Simulacion*/
    float temperature = round((rawTemperature / 4095.0) * 35.0);
    float humidity = round(((rawTemperature / 4095.0) * 100.0 + (rawPH / 4095.0) * 100.0) / 2.0);
    /* ================= */

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
    // StatusCode and the data in json format
    server.send(200, "application/json", json);
}


/* ============================= */
void setup() {

    Serial.begin(115200);

    dht.begin();

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