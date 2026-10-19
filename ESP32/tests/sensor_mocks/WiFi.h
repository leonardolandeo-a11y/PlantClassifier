#pragma once
#include <string>
#include <cstdint>
#include <cstring>
#include <cassert>
using String = std::string;
constexpr int WL_CONNECTED=1, WIFI_STA=1, ADC_11db=3, INPUT=0;
inline unsigned long mockTime=3000;
inline int adcCalls=0, adcValue=2048;
inline unsigned long millis() { return mockTime; }
inline void delay(unsigned long value) { mockTime+=value; }
inline int analogRead(int pin) { assert(pin==34); ++adcCalls; return adcValue; }
inline void analogReadResolution(int bits) { assert(bits==12); }
inline void analogSetPinAttenuation(int pin,int attenuation) { assert(pin==34 && attenuation==ADC_11db); }
inline void pinMode(int pin,int mode) { assert(pin==34 && mode==INPUT); }
struct MockSerial { void begin(int) {} template<class T> void print(T) {} template<class T> void println(T) {} };
inline MockSerial Serial;
struct MockIP { String toString() { return "127.0.0.1"; } };
struct MockWiFi {
 void mode(int) {} void setAutoReconnect(bool) {} void begin(const char*,const char*) {}
 int status() { return WL_CONNECTED; } MockIP localIP() { return {}; } void reconnect() {}
};
inline MockWiFi WiFi;
