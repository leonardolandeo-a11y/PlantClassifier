#pragma once
#include <esp_random.h>
#include "command_gate.h"
#include "wifi_config.h"

#ifndef ENABLE_SELFTEST_ENDPOINT
#define ENABLE_SELFTEST_ENDPOINT 0
#endif

CommandGate gate;
String controllerSession;
void robotStop();

void protocolError(int status, const char* message) {
  JsonDocument result;
  result["error"] = message;
  String body;
  serializeJson(result, body);
  server.send(status, "application/json", body);
}
bool authorized() {
  String supplied = server.header("X-Device-Token");
  size_t length = strlen(DEVICE_TOKEN);
  unsigned int difference = supplied.length() ^ length;
  for (size_t i = 0; i < length; ++i)
    difference |= uint8_t(DEVICE_TOKEN[i]) ^ uint8_t(i < supplied.length() ? supplied[i] : 0);
  if (length < 32 || strncmp(DEVICE_TOKEN, "REPLACE_", 8) == 0 || difference != 0) {
    protocolError(401, "Unauthorized");
    return false;
  }
  return true;
}
void acquireControl() {
  if (!authorized()) return;
  robotStop();
  char id[33];
  snprintf(id, sizeof(id), "%08lx%08lx%08lx%08lx", (unsigned long)esp_random(),
           (unsigned long)esp_random(), (unsigned long)esp_random(), (unsigned long)esp_random());
  controllerSession = id;
  gate.begin(millis());
  JsonDocument result;
  result["sessionId"] = controllerSession;
  result["deviceTimeMs"] = millis();
  String body;
  serializeJson(result, body);
  server.send(200, "application/json", body);
}
bool readCommand(JsonDocument& doc, String& command, int& speed) {
  if (!authorized()) return false;
  if (!server.hasArg("plain") || server.arg("plain").length() > 1024 ||
      deserializeJson(doc, server.arg("plain"))) {
    protocolError(400, "Invalid JSON body"); return false;
  }
  if (!doc["command"].is<const char*>() || !doc["sessionId"].is<const char*>() ||
      !doc["speed"].is<int>() || !doc["sequence"].is<uint32_t>() || !doc["deadlineMs"].is<uint32_t>()) {
    protocolError(400, "Missing or invalid fields"); return false;
  }
  command = doc["command"].as<String>();
  command.toUpperCase();
  speed = doc["speed"].as<int>();
  if (speed < 0 || speed > 255 || (command != "FORWARD" && command != "BACKWARD" &&
      command != "LEFT" && command != "RIGHT" && command != "CENTER" && command != "STOP")) {
    protocolError(400, "Invalid command or speed"); return false;
  }
  if (controllerSession != doc["sessionId"].as<String>() ||
      !gate.accept(doc["sequence"].as<uint32_t>(), doc["deadlineMs"].as<uint32_t>(), millis(), command == "STOP")) {
    protocolError(409, "Stale, duplicate or expired control"); return false;
  }
  return true;
}
void configureControl() {
  const char* headers[] = {"X-Device-Token"};
  server.collectHeaders(headers, 1);
  server.on("/control-session", HTTP_POST, acquireControl);
}
void checkControlSafety() {
  if (WiFi.status() != WL_CONNECTED || gate.expired(millis())) {
    if (gate.active) Serial.println("[FAILSAFE] Control lost -> STOP");
    gate.invalidate();
    robotStop();
  }
}
