// Actual sketch + actual ArduinoJson, mocked DHT/ADC/WiFi/WebServer only.
#include "PlantClassifier.ino"
int main() {
 setup();
 assert(!WiFi.sleep);
 assert(dht.initialized && server.routes.size()==5);
 server.request("/capture"); assert(server.status==401 && dht.reads==0);
 server.request("/status"); assert(server.status==401);
 server.request("/servo-session", HTTP_POST); assert(server.status==401);
 server.request("/servo", HTTP_POST); assert(server.status==401);
 server.token=DEVICE_TOKEN;
 server.request("/servo-session", HTTP_POST); assert(server.status==200);
 auto sendServo = [&](const char* cmd, unsigned seq, unsigned epoch) {
   JsonDocument request; request["command"]=cmd; request["sequence"]=seq;
   request["epoch"]=epoch; request["deadlineMs"]=uint32_t(millis()+750);
   server.input.clear(); serializeJson(request, server.input); server.request("/servo", HTTP_POST);
 };
 sendServo("INCREASE",1,servoEpoch); assert(server.status==200);
 server.request("/capture"); assert(server.status==409 && dht.reads==0);
 // Expired packets cannot refresh control, even when HTTP delivery was delayed.
 JsonDocument late; late["command"]="DECREASE"; late["sequence"]=2;
 late["epoch"]=servoEpoch; late["deadlineMs"]=uint32_t(millis()-1);
 server.input.clear(); serializeJson(late,server.input); server.request("/servo",HTTP_POST);
 assert(server.status==409 && sensorDirection==1);
 mockTime+=15; servoTick(); assert(sensorAngle==102);
 sendServo("HOLD",2,servoEpoch); assert(server.status==200);
 sendServo("INCREASE",1,servoEpoch); assert(server.status==409);
 mockTime+=15; servoTick(); assert(sensorAngle==102);
 server.request("/servo-session", HTTP_POST);
 sendServo("DECREASE",1,servoEpoch);
 for(int i=0;i<30;i++) { mockTime+=15; servoTick(); }
 assert(sensorAngle==70);
 sendServo("CENTER",2,servoEpoch);
 for(int i=0;i<15;i++) { mockTime+=15; servoTick(); }
 assert(sensorAngle==100);
 sendServo("INCREASE",3,servoEpoch); mockTime+=1001; servoTick();
 assert(sensorAngle==100 && !servoActive);
 sendServo("INCREASE",4,servoEpoch); assert(server.status==409);

 server.request("/servo-session", HTTP_POST); sendServo("INCREASE",1,servoEpoch);
 wifiStatus=0; servoTick(); assert(!servoActive && sensorDirection==0); wifiStatus=WL_CONNECTED;
 server.request("/status");
 JsonDocument doc;
 assert(!deserializeJson(doc,server.body));
 assert(doc["role"]=="sensor" && doc["phSource"]=="potentiometer");
 assert(doc["controlActive"].isNull());
 server.request("/movement"); assert(server.status==404);
 server.request("/control-session"); assert(server.status==404);
 server.request("/capture"); assert(server.status==200 && dht.reads==2 && adcCalls==16);
 assert(!deserializeJson(doc,server.body));
 float expected = calibratedSoil(2048, SOIL_DRY_RAW, SOIL_WET_RAW);
 if (isfinite(expected)) { assert(doc["soilMoisture"]==expected && doc["soilStatus"]=="calibrated"); }
 else { assert(doc["soilMoisture"].isNull() && doc["soilStatus"]=="calibration-pending"); }
 assert(doc["soilMoistureSource"]=="resistive-analog");
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
