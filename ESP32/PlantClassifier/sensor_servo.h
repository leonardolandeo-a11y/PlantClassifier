#pragma once
#include <ESP32Servo.h>
#include <esp_random.h>
// Preserve legacy limits until physical calibration; this is NOT robot steering.
constexpr int SENSOR_SERVO_PIN = 22, SENSOR_SERVO_MIN = 70, SENSOR_SERVO_MAX = 130, SENSOR_SERVO_CENTER = 100;
static_assert(DHTPIN == 21 && PH_PIN == 34 && SOIL_PIN == 35, "Verify sensor wiring");
Servo sensorServo;
int sensorAngle = SENSOR_SERVO_CENTER, sensorDirection = 0;
bool sensorCentering = false, sensorServoReady = false, servoActive = false;
uint32_t servoEpoch = 0, servoSequence = 0, servoLastCommand = 0, servoLastStep = 0;
void servoHold() { sensorDirection = 0; sensorCentering = false; }
void servoExpire() { servoHold(); servoActive = false; }
void servoTick() {
  uint32_t now = millis();
  if (WiFi.status() != WL_CONNECTED || (servoActive && uint32_t(now - servoLastCommand) >= 1000)) servoExpire();
  if (!sensorServoReady || !servoActive || now - servoLastStep < 15) return;
  servoLastStep = now;
  int target = sensorCentering ? SENSOR_SERVO_CENTER : sensorDirection > 0 ? SENSOR_SERVO_MAX : sensorDirection < 0 ? SENSOR_SERVO_MIN : sensorAngle;
  int delta = target - sensorAngle;
  sensorAngle += delta > 2 ? 2 : delta < -2 ? -2 : delta;
  if (delta) sensorServo.write(sensorAngle);
  if (sensorAngle == target) servoHold();
}
void servoReply() {
  JsonDocument doc;
  doc["angle"] = sensorAngle;
  doc["state"] = !sensorServoReady ? "fault" : sensorCentering ? "centering" : sensorDirection > 0 ? "increasing" : sensorDirection < 0 ? "decreasing" : "holding";
  doc["epoch"] = servoEpoch; doc["deviceTimeMs"] = uint32_t(millis());
  String body; serializeJson(doc, body); server.send(200, "application/json", body);
}
void servoStatus() { if (authorized()) { servoTick(); servoReply(); } }
void servoSession() {
  if (!authorized()) return;
  servoExpire();
  ++servoEpoch; if (!servoEpoch) ++servoEpoch;
  servoSequence = 0; servoLastCommand = millis(); servoActive = true;
  servoReply();
}
void servoCommand() {
  if (!authorized()) return;
  JsonDocument doc;
  if (server.arg("plain").length() > 256 || deserializeJson(doc, server.arg("plain")) ||
      !doc["command"].is<const char*>() || !doc["epoch"].is<uint32_t>() ||
      !doc["sequence"].is<uint32_t>() || !doc["deadlineMs"].is<uint32_t>()) {
    protocolError(400, "Invalid servo command"); return;
  }
  const char* command = doc["command"];
  bool stop = strcmp(command, "HOLD") == 0;
  if (!stop && strcmp(command, "INCREASE") && strcmp(command, "DECREASE") && strcmp(command, "CENTER")) {
    protocolError(400, "Invalid servo command"); return;
  }
  servoTick();
  int32_t remaining = int32_t(doc["deadlineMs"].as<uint32_t>() - uint32_t(millis()));
  if (!servoActive || doc["epoch"].as<uint32_t>() != servoEpoch || doc["sequence"].as<uint32_t>() <= servoSequence ||
      (!stop && (remaining <= 0 || remaining > 1000))) { protocolError(409, "Expired servo control"); return; }
  servoSequence = doc["sequence"]; servoLastCommand = millis();
  if (stop) servoExpire();
  else {
    if (!sensorServoReady) { servoExpire(); protocolError(503, "Servo unavailable"); return; }
    sensorCentering = strcmp(command, "CENTER") == 0;
    sensorDirection = sensorCentering ? 0 : strcmp(command, "INCREASE") == 0 ? 1 : -1;
  }
  servoReply();
}
void setupSensorServo() {
  servoEpoch = esp_random(); // Different boot epoch rejects pre-reboot traffic.
  sensorServo.setPeriodHertz(50);
  sensorServo.attach(SENSOR_SERVO_PIN, 500, 2400);
  sensorServoReady = sensorServo.attached();
  if (sensorServoReady) sensorServo.write(sensorAngle);
}
