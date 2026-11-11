#pragma once
struct ESP32PWM { static void allocateTimer(int timer) { assert(timer==0); } };
struct Servo {
 int angle=100;
 void setPeriodHertz(int hz) { assert(hz==50); }
 int attach(int pin,int lo,int hi) { assert(pin==22 && lo==500 && hi==2400); return 0; }
 bool attached() { return servoAttachOK; }
 void write(int value) { angle=value; }
};
