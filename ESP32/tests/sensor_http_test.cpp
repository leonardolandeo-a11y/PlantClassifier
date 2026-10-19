// Actual sketch + actual ArduinoJson, mocked DHT/ADC/WiFi/WebServer only.
#include "PlantClassifier.ino"
int main() {
 setup();
 assert(dht.initialized && server.routes.size()==2);
 server.request("/capture"); assert(server.status==401 && dht.reads==0);
 server.request("/status"); assert(server.status==401);
 server.token=DEVICE_TOKEN;
 server.request("/status");
 JsonDocument doc;
 assert(!deserializeJson(doc,server.body));
 assert(doc["role"]=="sensor" && doc["phSource"]=="potentiometer");
 assert(doc["controlActive"].isNull());
 server.request("/movement"); assert(server.status==404);
 server.request("/control-session"); assert(server.status==404);
 server.request("/capture"); assert(server.status==200 && dht.reads==2 && adcCalls==8);
 assert(!deserializeJson(doc,server.body));
 assert(doc["temperature"]==25 && doc["humidity"]==60 && doc["simulated"]==true);
 assert(doc["temperatureSource"]=="dht11" && doc["humiditySource"]=="dht11");
 assert(doc["phSource"]=="potentiometer" && fabs(doc["ph"].as<float>()-7)<.01);
 mockTime+=1000; dht.temperature=NAN;
 server.request("/capture"); assert(server.status==200 && dht.reads==2);
 assert(!deserializeJson(doc,server.body)); assert(doc["sampleAgeMs"]==1000);
 mockTime+=1000;
 server.request("/capture"); assert(server.status==503 && dht.reads==4);
 assert(!deserializeJson(doc,server.body)); assert(doc["error"].is<const char*>());
 dht.temperature=26;
 server.request("/capture"); assert(server.status==503 && dht.reads==4);
 mockTime+=2000; adcValue=4095;
 server.request("/capture"); assert(server.status==200 && dht.reads==6);
 assert(!deserializeJson(doc,server.body)); assert(doc["ph"]==14 && doc["temperature"]==26);
 puts("PASS actual sensor sketch: JSON, authentication, routes, sampling cache, failure and recovery");
}
