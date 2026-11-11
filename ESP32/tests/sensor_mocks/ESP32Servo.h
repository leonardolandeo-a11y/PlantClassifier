#pragma once
struct Servo {
 int angle = 100;
 void setPeriodHertz(int hz) { assert(hz == 50); }
 void attach(int pin, int low, int high) { assert(pin == 22 && low == 500 && high == 2400); }
 bool attached() { return true; }
 void write(int value) { assert(value >= 70 && value <= 130); angle = value; }
};
