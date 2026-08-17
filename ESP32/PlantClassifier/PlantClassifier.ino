#include <WiFi.h> // Wifi of the ESP32
#include <WiFiClientSecure.h> // Https secure connections
#include <HTTPClient.h>  // Http methods (Get, post, ...)
#include <ArduinoJson.h> // Allow us to work with JSON using the ESP32

/* Code for the sensor */
#include <DHT.h>

#define DHTPIN 4
#define DHTTYPE DHT11

DHT dht(DHTPIN, DHTTYPE);


/* ================= */
// Configuration of the red
#define WIFI_SSID "HONOR 400"
#define WIFI_PASSWORD "1234321q"

// Server URL
const char* serverURL = "http://10.11.86.253:8080/sensors";

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
    
}

void loop() {

    /*     Data simulation     */
    float temperature = dht.readTemperature();
    float humidity = dht.readHumidity();
    float ph = 20.0;

    // Create JSON and save the data
    JsonDocument doc;
    doc["ph"] = ph;
    doc["temperature"] = temperature;
    doc["humidity"] = humidity;
    

    // Converting JSON -> String
    String json;
    serializeJson(doc, json);

    Serial.println("Sending JSON:");
    Serial.println(json);
   
    
    /*     Connection ESP32 with the server     */

    if (WiFi.status() == WL_CONNECTED) {
        
        // Create the https client
        WiFiClient client;
        HTTPClient http;

        if (http.begin(client, serverURL)) {

            http.addHeader("Content-Type", "application/json");

            int responseCode = http.POST(json);

            Serial.print("HTTP response code: ");
            Serial.println(responseCode);

            if (responseCode > 0) {

                String response = http.getString();

                Serial.println("Server response:");
                Serial.println(response);

            } else {

                Serial.print("HTTP POST failed: ");
                Serial.println(http.errorToString(responseCode));
            }

            http.end();

        } else {
            Serial.println("Unable to connect to server");
        }

    } else {
        Serial.println("Wi-Fi disconnected!");
    }
    /* ================================ */
    delay(5000);
}