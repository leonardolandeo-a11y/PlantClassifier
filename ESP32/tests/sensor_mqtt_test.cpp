#include "PlantClassifier.ino"
#include "mqtt_test_helpers.h"
int main() {
 setup(); connectTransport(); server.token=DEVICE_TOKEN;
 server.request("/servo-session",HTTP_POST); assert(server.status==409);
 enqueue("/servo-session","{}"); tickMqtt(); assert(servoActive);
 auto body=[&](const char* command,int seq) {
  JsonDocument d; d["command"]=command; d["epoch"]=servoEpoch; d["sequence"]=seq;
  d["deadlineMs"]=uint32_t(millis()+750); String text; serializeJson(d,text); return text;
 };
 enqueue("/servo",body("INCREASE",1)); tickMqtt(); mockTime+=15; servoTick(); assert(sensorAngle==102);
 enqueue("/servo",body("DECREASE",2)); enqueue("/servo",body("HOLD",3),true);
 tickMqtt(); assert(!servoActive && sensorDirection==0); tickMqtt(); assert(sensorDirection==0);
 enqueue("/servo-session","{}"); tickMqtt(); enqueue("/servo",body("INCREASE",1)); tickMqtt();
 mqttOnline.store(false); tickMqtt(); assert(!servoActive && sensorDirection==0);
 mqttGeneration.store(2); mqttOnline.store(true); tickMqtt();
 enqueue("/servo",body("INCREASE",2),false,1); tickMqtt(); assert(!servoActive);
 enqueue("/servo-session","{}",false,2); tickMqtt(); enqueue("/servo",body("INCREASE",1),false,2); tickMqtt();
 mockTime+=1000; servoTick(); assert(!servoActive && sensorDirection==0);
 cleanupQueues(); puts("PASS MQTT sensor: exclusive mode, HOLD priority, disconnect, reconnect, watchdog");
}
