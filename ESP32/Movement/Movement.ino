// ESP32 + TB6612FNG + Servo + WiFi
// Basado en el diagnostico SIN WiFi que funciono fisicamente.
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
// PINES: EXACTAMENTE LOS DEL TEST QUE FUNCIONO
// ============================================================
constexpr int SERVO_PIN = 22;
constexpr int PWMA = 27;
constexpr int AIN1 = 25;
constexpr int AIN2 = 26;
constexpr int STBY = 32;

constexpr int PWM_FREQUENCY = 5000;
constexpr int PWM_RESOLUTION = 8;
constexpr int DEFAULT_SPEED = 180;

constexpr int SERVO_CENTER = 100;
constexpr int SERVO_LEFT = 70;
constexpr int SERVO_RIGHT = 130;

constexpr unsigned long COMMAND_TIMEOUT_MS = 1500;

// Dejar 1 SOLO para diagnosticar. Cambiar a 0 cuando termine la prueba.
#ifndef ENABLE_SELFTEST_ENDPOINT
#define ENABLE_SELFTEST_ENDPOINT 0
#endif

#if !SIMULATION_MODE
Servo steeringServo;
#endif
bool servoOK = false;
bool pwmOK = false;
bool lastPWMWriteOK = false;

int currentAngle = SERVO_CENTER;
int currentSpeed = 0;
int driveDirection = 0; // -1 atras, 0 parado, 1 adelante
unsigned long lastCommandTime = 0;

// ============================================================
// MOTOR: MISMAS OPERACIONES DIRECTAS QUE EL TEST
// ============================================================
void motorStop() {
#if !SIMULATION_MODE
  if (pwmOK) lastPWMWriteOK = ledcWrite(PWMA, 0);
  digitalWrite(AIN1, LOW);
  digitalWrite(AIN2, LOW);
  digitalWrite(STBY, LOW);
#endif
  driveDirection = 0;
  currentSpeed = 0;
}

bool motorDrive(int direction, int speed) {
  speed = constrain(speed, 0, 255);

#if SIMULATION_MODE
  driveDirection = speed == 0 ? 0 : direction;
  currentSpeed = speed;
  return true;
#else
  if (!pwmOK) return false;
  if (direction == 0 || speed == 0) {
    motorStop();
    return true;
  }

  // No invertir el motor con potencia aplicada.
  if (driveDirection != 0 && driveDirection != direction) {
    motorStop();
    delay(40);
  }

  digitalWrite(STBY, HIGH);
  digitalWrite(AIN1, direction > 0 ? HIGH : LOW);
  digitalWrite(AIN2, direction < 0 ? HIGH : LOW);
  lastPWMWriteOK = ledcWrite(PWMA, speed);

  if (!lastPWMWriteOK) {
    motorStop();
    return false;
  }

  driveDirection = direction;
  currentSpeed = speed;
  return true;
#endif
}

void servoMove(int angle) {
  currentAngle = constrain(angle, SERVO_LEFT, SERVO_RIGHT);
#if !SIMULATION_MODE
  if (servoOK) steeringServo.write(currentAngle);
#endif
}

void robotStop() {
  motorStop();
  servoMove(SERVO_CENTER);
}

// ============================================================
// INICIALIZACION: COPIADA EN EL MISMO ORDEN DEL TEST EXITOSO
// ============================================================
void setupHardware() {
#if SIMULATION_MODE
  Serial.println("[MODE] SIMULATION - HARDWARE OUTPUT DISABLED");
#else
  // 1. PRIMERO EL SERVO (tal como en el test)
  steeringServo.setPeriodHertz(50);
  steeringServo.attach(SERVO_PIN, 500, 2400);
  steeringServo.write(SERVO_CENTER);
  servoOK = steeringServo.attached();
  currentAngle = SERVO_CENTER;
  Serial.printf("[INIT] SERVO attached=%d\n", servoOK);

  // 2. DESPUES TB6612FNG Y PWM (tal como en el test)
  pinMode(STBY, OUTPUT);
  pinMode(AIN1, OUTPUT);
  pinMode(AIN2, OUTPUT);
  digitalWrite(STBY, LOW);
  digitalWrite(AIN1, LOW);
  digitalWrite(AIN2, LOW);

  pwmOK = ledcAttach(PWMA, PWM_FREQUENCY, PWM_RESOLUTION);
  Serial.printf("[INIT] PWM attached=%d\n", pwmOK);

  if (!pwmOK) {
    Serial.println("[ERROR] No se pudo configurar el PWM del motor");
    return; // STBY permanece en LOW
  }

  motorStop();
  // Standby remains LOW until an authenticated drive command.
  Serial.printf("[INIT] STBY=%d, PWM=%lu\n",
                digitalRead(STBY), (unsigned long)ledcRead(PWMA));
#endif
}

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
    if (!pwmOK) {
      robotStop(); gate.invalidate();
      sendError(503, "Motor PWM initialization failed");
      return;
    }
#endif
    int direction = command == "FORWARD" ? 1 : -1;
    if (!motorDrive(direction, speed)) {
      robotStop(); gate.invalidate();
      sendError(503, "Motor PWM write failed");
      return;
    }
  } else if (command == "LEFT" || command == "RIGHT") {
#if !SIMULATION_MODE
    if (!servoOK) {
      robotStop(); gate.invalidate();
      sendError(503, "Servo initialization failed");
      return;
    }
#endif
    motorStop(); // Steering-only commands must not leave earlier propulsion running.
    servoMove(command == "LEFT" ? SERVO_LEFT : SERVO_RIGHT);
  } else if (command == "CENTER") {
    motorStop();
    servoMove(SERVO_CENTER);
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
    server.handleClient();
  } else {
    if (driveDirection != 0 || currentAngle != SERVO_CENTER) robotStop();
    if (millis() - lastReconnectAttempt >= 5000) {
      lastReconnectAttempt = millis();
      WiFi.reconnect();
    }
  }

  if ((driveDirection != 0 || currentAngle != SERVO_CENTER) &&
      millis() - lastCommandTime > COMMAND_TIMEOUT_MS) {
    Serial.println("[FAILSAFE] Timeout -> STOP");
    robotStop();
  }
  if (diagnosticRunning) {
    if (WiFi.status() != WL_CONNECTED || int32_t(millis() - diagnosticDeadline) >= 0) {
      diagnosticRunning = false;
      gate.invalidate();
      robotStop();
    }
  }
  checkControlSafety();
  delay(1);
}
