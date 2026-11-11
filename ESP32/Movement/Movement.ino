// ESP32 + TB6612FNG + Servo + WiFi
// Hardware behavior requires validation on the assembled robot.
// Requiere ESP32 Arduino Core 3.x, ESP32Servo y ArduinoJson 7.
// Safe default: USB-only simulation. Real hardware mode requires an explicit opt-in.
// In real hardware mode, raise wheels before testing.

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include "wifi_config.h"
#include "simulation_config.h"
#if !SIMULATION_MODE
#include <ESP32Servo.h>
#endif

// ============================================================
// CONFIGURACION WIFI
// ============================================================



WebServer server(80);
#include "control_protocol.h"

// ============================================================
// Existing movement board pin assignments
// ============================================================
#include "actuators.h"
#include "movement_safety.h"

// ============================================================
// RESPUESTAS HTTP
// ============================================================
String acceptedCommand = "STOP";
String acceptedSteering = "CENTER";
uint32_t acceptedSequence = 0;
void sendStatus() {
  JsonDocument doc;
  doc["status"] = "online";
  doc["simulated"] = bool(SIMULATION_MODE);
  doc["mode"] = SIMULATION_MODE ? "simulation" : "hardware";
  doc["role"] = "movement";
  doc["hardwareOutputEnabled"] = !bool(SIMULATION_MODE);
  doc["controlActive"] = gate.active;
  doc["protocolVersion"] = 2;
  doc["lastReceivedCommand"] = lastReceivedCommand;
  doc["lastReceivedSteering"] = lastReceivedSteering;
  doc["lastReceivedSequence"] = lastReceivedSequence;
  doc["servoChannel"] = servoOK ? servoChannel : -1;
  doc["servoTimer"] = servoOK ? (servoChannel / 2) % 4 : -1;
  doc["lastAcceptedCommand"] = acceptedCommand;
  doc["lastAcceptedSteering"] = acceptedSteering;
  doc["lastAcceptedSequence"] = acceptedSequence;
  doc["protocolRejections"] = protocolRejections;
  doc["lastProtocolError"] = lastProtocolError;
  doc["physicalMotionVerified"] = false;
  doc["servoPin"] = SERVO_PIN;
  doc["servoFrequencyHz"] = 50;
  doc["motorPwmChannel"] = MOTOR_PWM_CHANNEL;
  doc["actuatorsReady"] = !SIMULATION_MODE && pwmOK && servoOK;
  doc["reversalDeadtimeMs"] = REVERSAL_DEADTIME_MS;
  doc["ip"] = WiFi.localIP().toString();
  doc["commandedMoving"] = driveDirection != 0;
  doc["speed"] = currentSpeed;
  doc["logicalDirection"] = driveDirection;
  doc["motorPolarity"] = MOTOR_POLARITY;
  doc["watchdogStops"] = watchdogStops;
  doc["sessionExpirations"] = sessionExpirations;
  doc["wifiStops"] = wifiStops;
  doc["reversalRejections"] = reversalRejections;
  doc["uptimeMs"] = millis();
  doc["commandAgeMs"] = uint32_t(millis() - lastCommandTime);
  doc["steeringAngle"] = currentAngle;
  doc["servoAttached"] = servoOK;
  doc["pwmAttached"] = pwmOK;
  doc["lastPwmWriteOk"] = lastPWMWriteOK;
#if !SIMULATION_MODE
  doc["pwmDuty"] = pwmOK ? (int)ledcRead(PWMA) : 0;
  doc["standbyPin"] = digitalRead(STBY);
  doc["ain1Pin"] = digitalRead(AIN1);
  doc["ain2Pin"] = digitalRead(AIN2);
#else
  doc["pwmDuty"] = 0;
#endif
  // Estos campos representan estados internos, NO movimiento medido.
  String body;
  serializeJson(doc, body);
  server.send(200, "application/json", body);
}

void handleMovement() {
  JsonDocument doc;
  String command;
  int speed;
  if (!readCommand(doc, command, speed)) return;

  // Legacy drive commands deterministically center steering. Legacy LEFT/RIGHT remain motor-off.
  String steering = doc["steering"].isNull()
      ? (command == "LEFT" || command == "RIGHT" ? command : String("CENTER"))
      : doc["steering"].as<String>();
  int direction = command == "FORWARD" ? 1 : command == "BACKWARD" ? -1 : 0;
  int targetAngle = steering == "LEFT" ? SERVO_LEFT : steering == "RIGHT" ? SERVO_RIGHT : SERVO_CENTER;
  if (command == "STOP") robotStop();
  else if (!applyMovement(direction, direction == 0 ? 0 : speed, targetAngle)) {
    gate.invalidate();
    protocolError(!pwmOK || !servoOK ? 503 : 409,
        !servoOK ? "Servo initialization failed" : !pwmOK ? "Motor PWM fault; restart required" : "Reversal interlock: release keys and wait");
    return;
  }
  if (acceptedCommand != command || acceptedSteering != steering)
    Serial.printf("[CONTROL] accepted propulsion=%d speed=%d steering=%s angle=%d servoAttached=%d pwmReady=%d\n",
                  driveDirection, currentSpeed, steering.c_str(), currentAngle, servoOK, pwmOK);
  acceptedCommand = command;
  acceptedSteering = steering;
  acceptedSequence = doc["sequence"].as<uint32_t>();

  lastCommandTime = millis();

  JsonDocument result;
  result["status"] = "OK";
  result["protocolVersion"] = 2;
  result["steering"] = steering;
  result["servoAttached"] = servoOK;
  result["pwmAttached"] = pwmOK;
  result["physicalMotionVerified"] = false;
  result["simulated"] = bool(SIMULATION_MODE);
  result["sessionId"] = controllerSession;
  result["sequence"] = doc["sequence"].as<uint32_t>();
  result["command"] = command;
  result["speed"] = currentSpeed;
  result["angle"] = currentAngle;
  result["commandedMoving"] = driveDirection != 0;
#if !SIMULATION_MODE
  result["pwmDuty"] = pwmOK ? (int)ledcRead(PWMA) : 0;
#else
  result["pwmDuty"] = 0;
#endif
  String body;
  serializeJson(result, body);
  server.send(200, "application/json", body);
}

// ============================================================
// SETUP / LOOP
// ============================================================
void setup() {
  Serial.begin(115200);
  setupHardware(); // ANTES DE INICIAR WIFI
  robotStop();

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);  // Disable Wi-Fi modem sleep
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[WIFI] Connecting");

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    Serial.print(".");
    delay(400);
  }
  Serial.println();

  configureControl();
  server.on("/status", HTTP_GET, []() { if (authorized()) sendStatus(); });
  server.on("/movement", HTTP_POST, handleMovement);
  server.begin();

  if (WiFi.status() == WL_CONNECTED) Serial.println("[WIFI] Connected");
  Serial.print("[WIFI] IP: ");
  Serial.println(WiFi.localIP());
  Serial.println("[HTTP] Server started");
}

void loop() {
  static unsigned long lastReconnectAttempt = 0;

  if (WiFi.status() == WL_CONNECTED) {
    checkMovementSafety(true, millis()); // Expire before processing newly arrived requests.
    server.handleClient();
  } else {
    checkMovementSafety(false, millis());
    if (millis() - lastReconnectAttempt >= 5000) {
      lastReconnectAttempt = millis();
      WiFi.reconnect();
    }
  }

  checkMovementSafety(WiFi.status() == WL_CONNECTED, millis());
  delay(1);
}
