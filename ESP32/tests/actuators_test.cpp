#include <cassert>
#include <cstdint>
#include <algorithm>
#include <vector>
#include <iostream>
#define CONFIG_IDF_TARGET_ESP32 1
constexpr int LOW=0, HIGH=1, OUTPUT=1;
uint32_t now=0;
unsigned long millis() { return now; }
int constrain(int n,int lo,int hi) { return std::clamp(n,lo,hi); }
struct Event { int pin, value; };
std::vector<Event> writes;
int pins[40]={}, duty=0, angle=100;
bool attachOK=true, servoAttachOK=true, writeOK=true;
void digitalWrite(int pin,int value) { writes.push_back({pin,value}); pins[pin]=value; }
void pinMode(int,int) { assert(pins[32]==0); }
bool ledcWrite(int pin,int value) { writes.push_back({pin,value}); if(writeOK) duty=value; return writeOK; }
bool ledcAttachChannel(int pin,int freq,int bits,int channel) {
  assert(pin==27 && freq==5000 && bits==8 && channel==2 && pins[32]==0);
  return attachOK;
}
int digitalRead(int pin) { return pins[pin]; }
struct SerialMock { void println(const char*) {} template<class... T> void printf(const char*,T...) {} } Serial;
struct ESP32PWM { static void allocateTimer(int t) { assert(t==0 && pins[32]==0); } };
struct Servo {
  void setPeriodHertz(int hz) { assert(hz==50); }
  void attach(int pin,int lo,int hi) { assert(pin==22 && lo==500 && hi==2400 && pins[32]==0); }
  bool attached() { return servoAttachOK; }
  void write(int a) { angle=a; }
};
#include "../Movement/actuators.h"
#include "../Movement/command_gate.h"
CommandGate gate;
#include "../Movement/movement_safety.h"
void reset() {
  now=0; writes.clear(); std::fill(pins,pins+40,0); duty=0;
  attachOK=servoAttachOK=writeOK=true;
  pwmOK=servoOK=lastPWMWriteOK=false;
  driveDirection=currentSpeed=lastPoweredDirection=0;
  motorStoppedAt=0; currentAngle=SERVO_CENTER;
}
int main() {
  reset(); setupHardware();
#if SIMULATION_MODE
  for(int d: {-1,1}) { assert(motorDrive(d,150)); assert(currentSpeed==150); }
  servoMove(70); robotStop();
  assert(writes.empty() && !pwmOK && !servoOK && duty==0);
#else
  assert(pwmOK && servoOK && pins[STBY]==0 && duty==0);
  for(auto e:writes) assert(!(e.pin==STBY && e.value==HIGH));
  writes.clear(); assert(motorDrive(1,150));
  assert(pins[AIN1]==HIGH && pins[AIN2]==LOW && duty==150 && pins[STBY]==HIGH);
  assert(writes.back().pin==STBY && writes.back().value==HIGH);
  assert(motorDrive(1,999) && duty==255);
  now=10; writes.clear(); assert(!motorDrive(-1,150));
  assert(writes.front().pin==STBY && writes.front().value==LOW);
  assert(duty==0 && pins[STBY]==LOW && driveDirection==0);
  now=509; assert(!motorDrive(-1,150));
  now=510; assert(motorDrive(-1,1));
  assert(pins[AIN1]==LOW && pins[AIN2]==HIGH && duty==1);
  assert(motorDrive(-1,-1) && duty==0 && pins[STBY]==LOW);
  assert(!motorDrive(1,100)); // STOP cannot bypass coast interval.
  now=1010; assert(motorDrive(1,100));
  servoMove(-100); assert(angle==70); servoMove(999); assert(angle==130);
  robotStop(); assert(angle==100 && duty==0 && pins[STBY]==LOW);
  assert(!motorDrive(2,100) && pins[STBY]==LOW);
  // Rollover and repeated STOP do not extend or bypass the interlock.
  now=0xffffff00U; assert(motorDrive(1,20)); motorStop();
  now=0x50; motorStop(); assert(!motorDrive(-1,20));
  now=0x100; assert(motorDrive(-1,20));
  writeOK=false; assert(!motorDrive(-1,50)); assert(!pwmOK && pins[STBY]==LOW);
  writeOK=true; assert(!motorDrive(-1,50)); // Fault remains latched.
  reset(); attachOK=false; setupHardware(); assert(!motorDrive(1,50) && pins[STBY]==LOW);
  reset(); servoAttachOK=false; setupHardware(); assert(!motorDrive(1,50) && pins[STBY]==LOW);
  angle=17; servoMove(130); assert(angle==17);
  reset(); writeOK=false; setupHardware(); assert(!pwmOK && !motorDrive(1,50) && pins[STBY]==LOW);
  reset(); setupHardware(); assert(motorDrive(1,50)); writeOK=false; motorStop();
  assert(!pwmOK && pins[STBY]==LOW && currentSpeed==0);
#endif
  reset(); setupHardware(); gate.begin(0);
  assert(gate.accept(1,1000,0,false)); assert(motorDrive(1,30));
  checkMovementSafety(true,1500); assert(driveDirection==1);
  checkMovementSafety(true,1501); assert(driveDirection==0 && !gate.active);
  assert(!gate.accept(2,2500,1502,false));
  gate.begin(2000); now=2000; lastCommandTime=2000;
  assert(motorDrive(1,30)); servoMove(SERVO_LEFT);
  checkMovementSafety(false,2001); assert(driveDirection==0 && currentAngle==SERVO_CENTER && !gate.active);
  checkMovementSafety(true,2002); assert(driveDirection==0);
  assert(!gate.accept(3,3000,2002,false));
  gate.begin(2100); assert(gate.accept(1,3000,2100,true)); robotStop();
  assert(!gate.accept(2,3000,2101,false));
  std::cout << "Actuators mode " << SIMULATION_MODE << ": all mock checks passed\n";
}
