#pragma once
#include <deque>
#include <vector>
#include <cstring>
struct MockQueue { size_t capacity, itemSize; std::deque<std::vector<unsigned char>> items; };
using QueueHandle_t = MockQueue*;
constexpr int pdTRUE=1, pdPASS=1;
inline QueueHandle_t xQueueCreate(size_t capacity,size_t size) { return new MockQueue{capacity,size,{}}; }
inline int xQueueSend(QueueHandle_t q,const void* item,int) {
 if(q->items.size()>=q->capacity) return 0;
 auto data=static_cast<const unsigned char*>(item); q->items.emplace_back(data,data+q->itemSize); return 1;
}
inline int xQueueOverwrite(QueueHandle_t q,const void* item) { q->items.clear(); return xQueueSend(q,item,0); }
inline void xQueueReset(QueueHandle_t q) { q->items.clear(); }
inline int xQueueReceive(QueueHandle_t q,void* item,int) {
 if(q->items.empty()) return 0;
 memcpy(item,q->items.front().data(),q->itemSize); q->items.pop_front(); return 1;
}
inline int xTaskCreate(void(*)(void*),const char*,int,void*,int,void*) { return pdPASS; } // Never start physical/network task.
inline void vTaskDelay(int) {}
inline int pdMS_TO_TICKS(int ms) { return ms; }
struct WiFiClient {};
struct MqttClient {
 explicit MqttClient(WiFiClient&) {}
 void setId(const char*) {} void setUsernamePassword(const char*,const char*) {}
 void setCleanSession(bool clean) { assert(clean); }
 void setKeepAliveInterval(int) {} void setConnectionTimeout(int) {}
 void beginWill(const String&,bool,int) {} void endWill() {}
 void print(const char*) {} void print(const String&) {}
 bool connected() { return false; } bool connect(const char*,int) { return false; }
 bool subscribe(const String&,int) { return false; } void stop() {}
 int parseMessage() { return 0; } bool messageRetain() { return false; }
 String messageTopic() { return ""; } int available() { return 0; } int read() { return -1; }
 void beginMessage(const String&,bool,int) {} void endMessage() {} void poll() {}
};
