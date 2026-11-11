#pragma once
void enqueue(const char* path, const String& body, bool urgent=false, uint32_t generation=1, uint32_t age=0) {
 JsonDocument doc; doc["id"]="mock-request"; doc["connectionId"]="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
 doc["path"]=path; doc["method"]="POST";
 JsonDocument value; assert(!deserializeJson(value,body)); doc["body"]=value;
 MqttFrame frame{}; frame.generation=generation; frame.received=millis()-age;
 serializeJson(doc,frame.payload,sizeof(frame.payload));
 assert((urgent?xQueueOverwrite(mqttUrgent,&frame):xQueueSend(mqttNormal,&frame,0))==pdTRUE);
}
void connectTransport() {
 mqttGeneration.store(1); mqttOnline.store(true); tickMqtt();
 MqttFrame retained{};
 strcpy(retained.payload,"{\"connectionId\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"body\":{}}");
 assert(!queueMqttFrame(retained,false,true,"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
 assert(!queueMqttFrame(retained,false,false,"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
 assert(!queueMqttFrame(retained,true,false,"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
}
void cleanupQueues() { delete mqttNormal; delete mqttUrgent; delete mqttReplies; }
