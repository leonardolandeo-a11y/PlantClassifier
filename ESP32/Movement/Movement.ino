#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>

// ============================================================
// WIFI CONFIGURATION
// ============================================================

const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

WebServer server(80);

// ============================================================
// MOTOR PINS
// CHANGE THESE AFTER WE IDENTIFY YOUR MOTOR DRIVER
// ============================================================

// LEFT SIDE
constexpr int LEFT_IN1 = 25;
constexpr int LEFT_IN2 = 26;
constexpr int LEFT_PWM = 27;

// RIGHT SIDE
constexpr int RIGHT_IN1 = 32;
constexpr int RIGHT_IN2 = 33;
constexpr int RIGHT_PWM = 14;

// ============================================================
// SAFETY
// ============================================================

unsigned long lastCommandTime = 0;

constexpr unsigned long COMMAND_TIMEOUT = 1500; // milliseconds

bool robotMoving = false;

// ============================================================
// MOTOR CLASS
// ============================================================

class Motor {

private:
    int in1;
    int in2;
    int pwmPin;

public:

    Motor(int pin1, int pin2, int pwm)
        : in1(pin1), in2(pin2), pwmPin(pwm) {}

    void begin() {

        pinMode(in1, OUTPUT);
        pinMode(in2, OUTPUT);

        // ESP32 Arduino Core 3.x
        ledcAttach(pwmPin, 20000, 8);

        stop();
    }

    void forward(int speed) {

        digitalWrite(in1, HIGH);
        digitalWrite(in2, LOW);

        ledcWrite(pwmPin, speed);
    }

    void backward(int speed) {

        digitalWrite(in1, LOW);
        digitalWrite(in2, HIGH);

        ledcWrite(pwmPin, speed);
    }

    void stop() {

        digitalWrite(in1, LOW);
        digitalWrite(in2, LOW);

        ledcWrite(pwmPin, 0);
    }
};

// ============================================================
// MOTORS
// ============================================================

Motor leftMotor(
    LEFT_IN1,
    LEFT_IN2,
    LEFT_PWM
);

Motor rightMotor(
    RIGHT_IN1,
    RIGHT_IN2,
    RIGHT_PWM
);

// ============================================================
// ROBOT MOVEMENT
// ============================================================

void stopRobot() {

    leftMotor.stop();
    rightMotor.stop();

    robotMoving = false;

    Serial.println("STOP");
}

void moveForward(int speed) {

    leftMotor.forward(speed);
    rightMotor.forward(speed);

    robotMoving = true;
    lastCommandTime = millis();

    Serial.println("FORWARD");
}

void moveBackward(int speed) {

    leftMotor.backward(speed);
    rightMotor.backward(speed);

    robotMoving = true;
    lastCommandTime = millis();

    Serial.println("BACKWARD");
}

void turnLeft(int speed) {

    leftMotor.backward(speed);
    rightMotor.forward(speed);

    robotMoving = true;
    lastCommandTime = millis();

    Serial.println("LEFT");
}

void turnRight(int speed) {

    leftMotor.forward(speed);
    rightMotor.backward(speed);

    robotMoving = true;
    lastCommandTime = millis();

    Serial.println("RIGHT");
}

// ============================================================
// HTTP
// ============================================================

void handleMovement() {

    if (!server.hasArg("plain")) {

        server.send(400,"application/json","{\"error\":\"Missing JSON body\"}");
        return;
    }

    JsonDocument document;

    DeserializationError error = deserializeJson(document, server.arg("plain"));

    if (error) {

        server.send(400,"application/json","{\"error\":\"Invalid JSON\"}");
        return;
    }

    String command = document["command"] | "";

    int speed = document["speed"] | 150;

    speed = constrain(speed, 0, 255);

    command.toUpperCase();

    // --------------------------------------------------------
    // Execute command
    // --------------------------------------------------------

    if (command == "FORWARD") {

        moveForward(speed);

    }
    else if (command == "BACKWARD") {

        moveBackward(speed);

    }
    else if (command == "LEFT") {

        turnLeft(speed);

    }
    else if (command == "RIGHT") {

        turnRight(speed);

    }
    else if (command == "STOP") {

        stopRobot();

    }
    else {

        server.send(400,"application/json","{\"error\":\"Unknown command\"}");
        return;
    }

    // --------------------------------------------------------
    // Response
    // --------------------------------------------------------

    String response =
        "{\"status\":\"OK\",\"command\":\""
        + command
        + "\",\"speed\":"
        + String(speed)
        + "}";

    server.send(
        200,
        "application/json",
        response
    );
}

// ============================================================
// STATUS ENDPOINT
// ============================================================

void handleStatus() {

    String response =
        "{"
        "\"status\":\"online\","
        "\"ip\":\""
        + WiFi.localIP().toString()
        + "\""
        "}";

    server.send(
        200,
        "application/json",
        response
    );
}

// ============================================================
// WIFI
// ============================================================

void connectWiFi() {

    Serial.println();
    Serial.print("Connecting to WiFi");

    WiFi.begin(
        WIFI_SSID,
        WIFI_PASSWORD
    );

    while (WiFi.status() != WL_CONNECTED) {

        delay(500);
        Serial.print(".");
    }

    Serial.println();
    Serial.println("WiFi connected!");

    Serial.print("ESP32 IP: ");
    Serial.println(WiFi.localIP());
}

// ============================================================
// SETUP
// ============================================================

void setup() {

    Serial.begin(115200);

    leftMotor.begin();
    rightMotor.begin();

    stopRobot();

    connectWiFi();

    // --------------------------------------------------------
    // API
    // --------------------------------------------------------

    server.on(
        "/movement",
        HTTP_POST,
        handleMovement
    );

    server.on(
        "/status",
        HTTP_GET,
        handleStatus
    );

    server.begin();

    Serial.println();
    Serial.println("Movement server started");
    Serial.println("=======================");

    Serial.print("http://");
    Serial.print(WiFi.localIP());
    Serial.println("/status");

    Serial.println("=======================");
}

// ============================================================
// LOOP
// ============================================================

void loop() {

    server.handleClient();

    // ========================================================
    // FAILSAFE
    // ========================================================

    if (robotMoving && millis() - lastCommandTime > COMMAND_TIMEOUT ) {

        Serial.println("FAILSAFE -> STOP");

        stopRobot();
    }
}