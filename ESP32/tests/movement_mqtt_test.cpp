#include "Movement.ino"
#include "mqtt_test_helpers.h"
int main() {
 setup(); connectTransport(); server.token=DEVICE_TOKEN;
 server.request("/control-session"); assert(server.status==409);
 enqueue("/control-session","{}"); tickMqtt(); assert(gate.active);
 auto body=[&](const char* command,int seq) {
  JsonDocument d; d["command"]=command; d["sessionId"]=controllerSession; d["sequence"]=seq;
  d["deadlineMs"]=uint32_t(millis()+750); d["speed"]=150;
  d["steering"]=strcmp(command,"STOP")==0?"CENTER":"LEFT";
  String text; serializeJson(d,text); return text;
 };
 enqueue("/movement",body("FORWARD",1)); tickMqtt(); assert(driveDirection==1 && currentAngle==SERVO_LEFT);
 enqueue("/movement",body("FORWARD",1)); tickMqtt(); assert(gate.sequence==1);
 enqueue("/movement",body("FORWARD",2));
 enqueue("/movement",body("STOP",3),true); tickMqtt(); assert(!gate.active && driveDirection==0);
 tickMqtt(); assert(driveDirection==0); // Queued normal packet cannot undo priority STOP.
 enqueue("/control-session","{}"); tickMqtt(); enqueue("/movement",body("FORWARD",1)); tickMqtt();
 mqttOnline.store(false); tickMqtt(); assert(!gate.active && driveDirection==0);
 mqttOnline.store(true); mqttGeneration.store(2); tickMqtt();
 enqueue("/movement",body("FORWARD",2),false,1); tickMqtt(); assert(driveDirection==0);
 enqueue("/control-session","{}",false,2,251); tickMqtt(); assert(!gate.active);
 enqueue("/control-session","{}",false,2); tickMqtt(); assert(gate.active);
 enqueue("/movement",body("FORWARD",1),false,2); tickMqtt();
 mockTime+=1600; checkMovementSafety(true,millis()); assert(driveDirection==0 && !gate.active);
 // A stale stop cannot overwrite the current stop in a full urgent mailbox.
 enqueue("/control-session","{}",false,2); tickMqtt();
 enqueue("/movement",body("FORWARD",1),false,2); tickMqtt();
 enqueue("/movement",body("STOP",2),true,2);
 MqttFrame stale{};
 strcpy(stale.payload,"{\"connectionId\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"body\":{\"command\":\"STOP\"}}");
 assert(!queueMqttFrame(stale,true,false,"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
 assert(mqttUrgentOverflow.load());
 tickMqtt(); assert(!gate.active && driveDirection==0);
 // Fill the normal mailbox and response queue; neither may block priority STOP.
 enqueue("/control-session","{}",false,2); tickMqtt();
 enqueue("/movement",body("FORWARD",1),false,2); tickMqtt();
 MqttFrame normal{}; normal.generation=2; normal.received=millis();
 strcpy(normal.payload,"{\"id\":\"saturated\",\"connectionId\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"method\":\"GET\",\"path\":\"/status\",\"body\":{}}");
 for(int i=0;i<4;i++) assert(queueMqttFrame(normal,false,false,"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
 assert(!queueMqttFrame(normal,false,false,"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
 for(int i=0;i<8;i++) xQueueSend(mqttReplies,&normal,0);
 enqueue("/movement",body("STOP",2),true,2); tickMqtt();
 assert(!gate.active && driveDirection==0);
 cleanupQueues(); puts("PASS MQTT movement: exclusive mode, duplicate, STOP priority, disconnect, reconnect, queue age, watchdog");
}
