#pragma once
#define DHT11 11
struct DHT {
 float temperature=25, humidity=60;
 int reads=0;
 bool initialized=false;
 DHT(int pin,int type) { assert(pin==22 && type==11); }
 void begin() { initialized=true; }
 float readTemperature() { assert(initialized); ++reads; return temperature; }
 float readHumidity() { assert(initialized); ++reads; return humidity; }
};
