#pragma once
#if __has_include("mqtt_config.h")
#include "mqtt_config.h"
#endif
#ifndef MQTT_ENABLED
#define MQTT_ENABLED 0
#endif
#if MQTT_ENABLED
#define MQTT_ROLE "movement"
#include <PlantMqtt.h>
#else
bool mqttHandling = false;
String requestBody() { return server.arg("plain"); }
void mqttReply(int status, const char* type, const String& body) { server.send(status, type, body); }
void setupMqtt() {}
void tickMqtt() {}
#endif
