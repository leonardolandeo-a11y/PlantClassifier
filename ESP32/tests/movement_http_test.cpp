// Real movement sketch and ArduinoJson. All Wi-Fi, PWM, GPIO and servo I/O are mocks.
#include "Movement.ino"
JsonDocument response() { JsonDocument doc; assert(!deserializeJson(doc, server.body)); return doc; }
void acquire() { server.request("/control-session"); assert(server.status==200); assert(response()["protocolVersion"]==2); }
void send(const char* command, const char* steering, uint32_t sequence, int speed=150) {
 JsonDocument doc; doc["command"]=command; doc["speed"]=speed; doc["sessionId"]=controllerSession;
 doc["sequence"]=sequence; doc["deadlineMs"]=mockTime+1000;
 if(steering) doc["steering"]=steering;
 server.input.clear(); serializeJson(doc,server.input); server.request("/movement");
}
int main() {
 setup(); server.request("/control-session"); assert(server.status==401);
 server.token=DEVICE_TOKEN; acquire();
#if !SIMULATION_MODE
 assert(servoOK && servoChannel==0); // Channel zero is valid, not attach failure.
#endif
 for(const char* command:{"FORWARD","BACKWARD"}) {
  mockTime+=600; acquire();
  uint32_t seq=0;
  for(const char* turn:{"CENTER","LEFT","RIGHT","CENTER"}) {
   int drops=standbyDrops;
   send(command,turn,++seq); assert(server.status==200);
   assert(currentSpeed==150 && driveDirection==(String(command)=="FORWARD"?1:-1));
   assert(response()["steering"]==turn && response()["protocolVersion"]==2);
   assert(currentAngle==(String(turn)=="LEFT"?70:String(turn)=="RIGHT"?130:100));
   assert(standbyDrops==drops);
   for(int i=0;i<8;++i) { mockTime+=250; checkMovementSafety(true,mockTime); send(command,turn,++seq); assert(server.status==200 && currentSpeed==150); }
   assert(standbyDrops==drops);
  }
  send("LEFT","LEFT",++seq,0); assert(server.status==200 && currentSpeed==0 && currentAngle==70);
  send("STOP",nullptr,++seq,0); assert(server.status==200 && currentAngle==100 && !gate.active);
  send(command,"RIGHT",++seq); assert(server.status==409 && currentSpeed==0);
 }
 mockTime+=600; acquire();send("FORWARD","LEFT",1);assert(server.status==200);
 send("FORWARD","RIGHT",1);assert(server.status==409 && currentAngle==70);
 send("FORWARD","INVALID",2);assert(server.status==400 && currentAngle==70);
 send("LEFT","RIGHT",2);assert(server.status==400);
 // An expired HTTP body never reaches actuation.
 JsonDocument expired; deserializeJson(expired,server.input);expired["command"]="FORWARD";expired["steering"]="LEFT";expired["deadlineMs"]=mockTime-1;
 server.input.clear();serializeJson(expired,server.input);server.request("/movement");assert(server.status==409);
 send("BACKWARD","LEFT",2);
#if !SIMULATION_MODE
 assert(server.status==409 && currentSpeed==0 && currentAngle==100 && !gate.active);
#else
 assert(server.status==200);
#endif
 acquire();send("FORWARD","LEFT",1);checkMovementSafety(false,mockTime);assert(currentSpeed==0 && currentAngle==100 && !gate.active);
 checkMovementSafety(true,++mockTime);assert(currentSpeed==0);
 acquire();send("FORWARD","RIGHT",1);mockTime+=1501;checkMovementSafety(true,mockTime);
 assert(currentSpeed==0 && currentAngle==100 && !gate.active);
 send("FORWARD","LEFT",2);assert(server.status==409);
 // Old session bodies cannot reopen control, even with larger sequences.
 acquire();send("LEFT","LEFT",1,0);String oldBody=server.input;
 acquire();server.input=oldBody;server.request("/movement");assert(server.status==409 && currentSpeed==0 && currentAngle==100);
 send("LEFT","LEFT",1,0);String pending=server.input;
 send("STOP",nullptr,2,0);server.input=pending;server.request("/movement");assert(server.status==409 && currentAngle==100);
 // Independent steering watchdog: session refreshed but actuation timestamp stale.
 acquire();send("LEFT","LEFT",1,0);mockTime+=1501;gate.lastCommand=mockTime;
 checkMovementSafety(true,mockTime);assert(!gate.active && currentAngle==100);
 // Explicit session expiry even at centered, zero propulsion state.
 acquire();send("CENTER","CENTER",1,0);mockTime+=1501;checkMovementSafety(true,mockTime);assert(!gate.active && currentSpeed==0);
 // Legacy requests remain complete, deterministic states.
 acquire();send("LEFT",nullptr,1);assert(server.status==200 && currentSpeed==0 && currentAngle==70);
 send("FORWARD",nullptr,2);assert(server.status==200 && currentAngle==100);
 send("RIGHT",nullptr,3);assert(server.status==200 && currentSpeed==0 && currentAngle==130);
 send("STOP",nullptr,4,0);assert(server.status==200 && currentAngle==100);
#if !SIMULATION_MODE
 servoOK=false;acquire();send("FORWARD","LEFT",1);assert(server.status==503 && currentSpeed==0);
 servoOK=true;pwmOK=false;acquire();send("FORWARD","LEFT",1);assert(server.status==503 && currentSpeed==0);
 pwmOK=true;pwmWriteOK=false;acquire();send("FORWARD","LEFT",1);assert(server.status==503 && currentSpeed==0);
#endif
 server.request("/status");assert(server.status==200);auto status=response();
 assert(status["physicalMotionVerified"]==false && status["protocolRejections"].as<int>()>0);
 assert(status["steeringAngle"]==100 && status["controlActive"]==false);
 puts("PASS real movement HTTP sketch: combined axes, legacy, ACK, watchdog, Wi-Fi, STOP, interlock, faults");
}
