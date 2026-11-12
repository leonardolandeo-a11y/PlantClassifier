#pragma once
#include <ArduinoMqttClient.h>
#include <atomic>
#include <esp_random.h>
// Only the network worker touches the MQTT client. Only loop() touches actuators/JSON handlers.
// No String/JsonDocument is shared across tasks.
struct MqttFrame { char payload[2048]; uint32_t generation, received; bool telemetry; };
QueueHandle_t mqttNormal, mqttUrgent, mqttReplies;
std::atomic<bool> mqttOnline{false};
std::atomic<bool> mqttUrgentOverflow{false};
std::atomic<uint32_t> mqttGeneration{0};
bool mqttHandling = false;
String mqttBody, mqttRequestId, mqttConnection;
uint32_t mqttReceived = 0, mqttHandledGeneration = 0;
void mqttDispatch(const String& method, const String& path);
void mqttStop();
void mqttReply(int status, const char*, const String& body) {
  if (!mqttHandling) { server.send(status, "application/json", body); return; }
  JsonDocument doc, value;
  if (deserializeJson(value, body)) return;
  doc["id"] = mqttRequestId; doc["connectionId"] = mqttConnection;
  doc["status"] = status; doc["body"] = value;
  doc["receivedMs"] = mqttReceived; doc["ackMs"] = uint32_t(millis());
  MqttFrame frame{}; frame.generation = mqttHandledGeneration; frame.telemetry = mqttRequestId.length() == 0;
  if (measureJson(doc) >= sizeof(frame.payload)) return;
  serializeJson(doc, frame.payload, sizeof(frame.payload));
  // Dropping an ACK leads to explicit timeout, never a false success or blocked safety loop.
  xQueueSend(mqttReplies, &frame, 0);
}
String requestBody() { return mqttHandling ? mqttBody : server.arg("plain"); }
bool queueMqttFrame(const MqttFrame& frame, bool urgent, bool retained, const String& connection) {
  if (retained) return false;
  JsonDocument doc;
  if (deserializeJson(doc, frame.payload) || doc["connectionId"].as<String>() != connection) return false;
  if (urgent) {
    String command = doc["body"]["command"].as<String>();
    if (command != "STOP" && command != "HOLD") return false;
    // Preserve the first valid stop: a stale later packet must never overwrite it.
    // Saturation fails closed on the actuator task, without acknowledging execution.
    if (xQueueSend(mqttUrgent, &frame, 0) == pdTRUE) return true;
    mqttUrgentOverflow.store(true);
    return false;
  }
  return xQueueSend(mqttNormal, &frame, 0) == pdTRUE;
}
void mqttWorker(void*) {
  WiFiClient network;
  MqttClient mqtt(network);
  String base = String("plant/v1/") + MQTT_ROLE;
  mqtt.setId(MQTT_CLIENT_ID);
  mqtt.setUsernamePassword(MQTT_USERNAME, MQTT_PASSWORD);
  mqtt.setCleanSession(true);
  mqtt.setKeepAliveInterval(2000); mqtt.setConnectionTimeout(1000);
  mqtt.beginWill(base + "/state", false, 0); mqtt.print("{\"online\":false}"); mqtt.endWill();
  uint32_t lastAttempt = 0, lastState = 0, lastProbe = 0, probeRtt = 0;
  bool probePending = false, probeValid = false;
  String connection;
  for (;;) {
    if (WiFi.status() != WL_CONNECTED || !mqtt.connected()) {
      mqttOnline.store(false);
      if (WiFi.status() == WL_CONNECTED && uint32_t(millis() - lastAttempt) >= 3000) {
        lastAttempt = millis();
        if (mqtt.connect(MQTT_HOST, MQTT_PORT)) {
          // A fresh nonce for every TCP connection prevents retained/replayed acquisitions.
          char nonce[33];
          snprintf(nonce, sizeof(nonce), "%08lx%08lx%08lx%08lx", (unsigned long)esp_random(),
                   (unsigned long)esp_random(), (unsigned long)esp_random(), (unsigned long)esp_random());
          connection = nonce;
          xQueueReset(mqttNormal); xQueueReset(mqttUrgent); xQueueReset(mqttReplies);
          mqttGeneration.fetch_add(1);
          if (mqtt.subscribe(base + "/command", 0) && mqtt.subscribe(base + "/urgent", 0) && mqtt.subscribe(base + "/probe", 0)) {
            probePending = false; probeValid = false;
            mqttOnline.store(true); lastState = millis() - 1000;
          } else mqtt.stop();
        }
      }
    } else {
      int size = mqtt.parseMessage();
      if (size > 0) {
        bool retained = mqtt.messageRetain();
        bool urgent = mqtt.messageTopic() == base + "/urgent";
        bool probe = mqtt.messageTopic() == base + "/probe";
        MqttFrame frame{}; frame.generation = mqttGeneration.load(); frame.received = millis();
        int count = 0;
        while (mqtt.available()) { int c = mqtt.read(); if (count < int(sizeof(frame.payload))-1) frame.payload[count++] = char(c); }
        if (probe && !retained && probePending && String(frame.payload) == connection) {
          probeRtt = uint32_t(millis() - lastProbe); probeValid = true; probePending = false;
        }
        if (!probe && size < int(sizeof(frame.payload)))
          queueMqttFrame(frame, urgent, retained, connection);
      }
      MqttFrame reply{};
      if (xQueueReceive(mqttReplies, &reply, 0) == pdTRUE && reply.generation == mqttGeneration.load()) {
        mqtt.beginMessage(base + (reply.telemetry ? "/telemetry" : "/ack"), false, 0); mqtt.print(reply.payload); mqtt.endMessage();
      }
      if (uint32_t(millis() - lastState) >= 1000) {
        lastState = millis();
        JsonDocument state;
        if (probeValid) state["brokerRoundTripMs"] = probeRtt;
        state["probePending"] = probePending;
        state["online"] = true; state["connectionId"] = connection; state["uptimeMs"] = uint32_t(millis());
        String payload; serializeJson(state, payload);
        mqtt.beginMessage(base + "/state", false, 0); mqtt.print(payload); mqtt.endMessage();
      }
      if (uint32_t(millis() - lastProbe) >= 10000) {
        lastProbe = millis(); probePending = true;
        mqtt.beginMessage(base + "/probe", false, 0); mqtt.print(connection); mqtt.endMessage();
      }
      mqtt.poll();
    }
    vTaskDelay(pdMS_TO_TICKS(2));
  }
}
void setupMqtt() {
  mqttNormal = xQueueCreate(4, sizeof(MqttFrame)); mqttUrgent = xQueueCreate(1, sizeof(MqttFrame));
  mqttReplies = xQueueCreate(8, sizeof(MqttFrame));
  if (!mqttNormal || !mqttUrgent || !mqttReplies) { mqttStop(); return; }
  if (xTaskCreate(mqttWorker, "mqtt-network", 8192, nullptr, 1, nullptr) != pdPASS) mqttStop();
}
void tickMqtt() {
  uint32_t generation = mqttGeneration.load();
  if (WiFi.status() != WL_CONNECTED || !mqttOnline.load() || generation != mqttHandledGeneration) {
    mqttStop(); mqttHandledGeneration = generation;
  }
  if (WiFi.status() != WL_CONNECTED || !mqttOnline.load() || !mqttNormal || !mqttUrgent) return;
  if (mqttUrgentOverflow.exchange(false)) {
    mqttStop();
    xQueueReset(mqttNormal); // Invalidate queued acquisitions as well as motion.
    xQueueReset(mqttUrgent);
    return; // Discarded operations expire; never fabricate a successful ACK.
  }
  MqttFrame frame{};
  bool urgent = xQueueReceive(mqttUrgent, &frame, 0) == pdTRUE;
  if (!urgent && xQueueReceive(mqttNormal, &frame, 0) != pdTRUE) {
    static uint32_t lastTelemetry = 0;
    if (uint32_t(millis() - lastTelemetry) >= 1000) {
      lastTelemetry = millis(); mqttHandling = true; mqttRequestId = ""; mqttReceived = millis();
      mqttDispatch("GET", "/status"); mqttHandling = false;
    }
    return;
  }
  if (frame.generation != generation || (!urgent && uint32_t(millis() - frame.received) > 250)) return;
  JsonDocument doc;
  if (deserializeJson(doc, frame.payload) || !doc["id"].is<const char*>() || !doc["body"].is<JsonObject>()) return;
  mqttHandling = true; mqttRequestId = doc["id"].as<String>(); mqttConnection = doc["connectionId"].as<String>();
  mqttReceived = frame.received; mqttBody = ""; serializeJson(doc["body"], mqttBody);
  mqttDispatch(doc["method"].as<String>(), doc["path"].as<String>());
  mqttHandling = false; mqttBody = "";
}
