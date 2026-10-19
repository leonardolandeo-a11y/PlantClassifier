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
#include "simulated_capture.h"

// ============================================================
// Existing movement board pin assignments
// ============================================================
#include "actuators.h"
#include "movement_safety.h"

// ============================================================
// DIAGNOSTICO ACOTADO Y NO BLOQUEANTE (DISPARADO POR HTTP)
// ============================================================
bool diagnosticRunning = false;
uint32_t diagnosticDeadline = 0;
bool selfTest() {
  robotStop();
  diagnosticRunning = motorDrive(1, 200);
  lastCommandTime = millis();
  diagnosticDeadline = lastCommandTime + 1000;
  Serial.println("[TEST] Commanded forward PWM for at most 1 s; physical movement is not measured");
  return diagnosticRunning;
}

// ============================================================
// RESPUESTAS HTTP
// ============================================================
void sendError(int code, const char* message) {
  JsonDocument doc;
  doc["error"] = message;
  String body;
  serializeJson(doc, body);
  server.send(code, "application/json", body);
}

void sendStatus() {
  JsonDocument doc;
  doc["status"] = "online";
  doc["simulated"] = bool(SIMULATION_MODE);
  doc["mode"] = SIMULATION_MODE ? "simulation" : "hardware";
  doc["sensorSimulated"] = bool(SENSOR_SIMULATION_MODE);
  doc["hardwareOutputEnabled"] = !bool(SIMULATION_MODE);
  doc["controlActive"] = gate.active;
  doc["actuatorsReady"] = !SIMULATION_MODE && pwmOK && servoOK;
  doc["reversalDeadtimeMs"] = REVERSAL_DEADTIME_MS;
  doc["ip"] = WiFi.localIP().toString();
  doc["commandedMoving"] = driveDirection != 0;
  doc["speed"] = currentSpeed;
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
  diagnosticRunning = false;

  if (command == "FORWARD" || command == "BACKWARD") {
#if !SIMULATION_MODE
    if (!pwmOK || !servoOK) {
      robotStop(); gate.invalidate();
      sendError(503, "Actuator initialization failed");
      return;
    }
#endif
    int direction = command == "FORWARD" ? 1 : -1;
    if (!motorDrive(direction, speed)) {
      robotStop(); gate.invalidate();
      sendError(pwmOK ? 409 : 503, pwmOK ? "Reversal interlock: release keys, wait for motor to stop, then press again" : "Motor PWM fault; restart required");
      return;
    }
  } else if (command == "LEFT" || command == "RIGHT" || command == "CENTER") {
#if !SIMULATION_MODE
    if (!servoOK) {
      robotStop(); gate.invalidate();
      sendError(503, "Servo initialization failed");
      return;
    }
#endif
    motorStop(); // Steering-only commands must not leave earlier propulsion running.
    servoMove(command == "LEFT" ? SERVO_LEFT : command == "RIGHT" ? SERVO_RIGHT : SERVO_CENTER);
  } else if (command == "STOP") {
    robotStop();
  } else {
    sendError(400, "Unknown command");
    return;
  }

  lastCommandTime = millis();
#if SIMULATION_MODE
  Serial.printf("[CMD] %s speed=%d\n", command.c_str(), currentSpeed);
  Serial.printf("[SIMULATION] %s accepted; hardware output disabled\n", command.c_str());
#else
  Serial.printf("[CMD] %s speed=%d angle=%d PWM=%lu STBY=%d\n",
                command.c_str(), currentSpeed, currentAngle,
                (unsigned long)(pwmOK ? ledcRead(PWMA) : 0),
                digitalRead(STBY));
#endif

  JsonDocument result;
  result["status"] = "OK";
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
#if SENSOR_SIMULATION_MODE
  server.on("/capture", HTTP_GET, simulatedCapture);
#endif
#if ENABLE_SELFTEST_ENDPOINT
  server.on("/test", HTTP_POST, []() {
    JsonDocument doc;
    String command;
    int speed;
    if (!readCommand(doc, command, speed)) return;
    if (command != "FORWARD" || speed != 200) {
      robotStop(); gate.invalidate();
      protocolError(400, "Diagnostic requires FORWARD at speed 200"); return;
    }
    if (!selfTest()) {
      robotStop(); gate.invalidate();
      protocolError(503, "Diagnostic PWM command failed"); return;
    }
    server.send(200, "application/json", "{\"status\":\"test commanded\"}");
  });
#endif
  server.begin();

  if (WiFi.status() == WL_CONNECTED) Serial.println("[WIFI] Connected");
  Serial.print("[WIFI] IP: ");
  Serial.println(WiFi.localIP());
  Serial.println("[HTTP] Server started");
#if ENABLE_SELFTEST_ENDPOINT
  Serial.println("[HTTP] /test habilitado SOLO para diagnostico");
#endif
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

  if (diagnosticRunning) {
    if (WiFi.status() != WL_CONNECTED || int32_t(millis() - diagnosticDeadline) >= 0) {
      diagnosticRunning = false;
      gate.invalidate();
      robotStop();
    }
  }
  checkMovementSafety(WiFi.status() == WL_CONNECTED, millis());
  delay(1);
}
