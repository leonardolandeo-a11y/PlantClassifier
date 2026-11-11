#pragma once
#include <string>
#include <algorithm>
#include <cstdint>
#include <cstring>
#include <cassert>
#include <ArduinoJson.h>
class String : public std::string {
public:
 using std::string::string;
 String(const std::string& s):std::string(s) {}
 size_t write(uint8_t c) { push_back(static_cast<char>(c)); return 1; }
 size_t write(const uint8_t* s,size_t n) { append(reinterpret_cast<const char*>(s),n); return n; }
 void toUpperCase() { for(char& c:*this) if(c>='a' && c<='z') c-=32; }
};
namespace ArduinoJson {
template<> struct Converter<String> {
 static String fromJson(JsonVariantConst src) { return src.as<std::string>(); }
 static void toJson(const String& src, JsonVariant dst) { dst.set(static_cast<const std::string&>(src)); }
};
}
constexpr int WL_CONNECTED=1, WIFI_STA=1, LOW=0, HIGH=1, OUTPUT=1;
inline uint32_t mockTime=0;
inline unsigned long millis() { return mockTime; }
inline void delay(unsigned long ms) { mockTime+=ms; }
inline int constrain(int n,int lo,int hi) { return std::clamp(n,lo,hi); }
inline int pins[40]={}, duty=0;
inline bool pwmAttachOK=true, pwmWriteOK=true, servoAttachOK=true;
inline int standbyDrops=0;
inline void digitalWrite(int pin,int value) { if(pin==32 && pins[pin]==1 && value==0) ++standbyDrops; pins[pin]=value; }
inline void pinMode(int,int) {}
inline int digitalRead(int pin) { return pins[pin]; }
inline bool ledcWrite(int,int value) { if(pwmWriteOK) duty=value; return pwmWriteOK; }
inline int ledcRead(int) { return duty; }
inline bool ledcAttachChannel(int pin,int hz,int bits,int channel) { assert(pin==27 && hz==5000 && bits==8 && channel==2); return pwmAttachOK; }
struct MockSerial { template<class... Args> void printf(const char*, Args...) {} void println() {} void begin(int) {} template<class T> void print(T) {} template<class T> void println(T) {} };
inline MockSerial Serial;
struct MockIP { String toString() { return "127.0.0.1"; } };
struct MockWiFi {
 bool connected=true;
 void mode(int) {} void setAutoReconnect(bool) {} void begin(const char*,const char*) {}
 void setSleep(bool enabled) { assert(!enabled); }
 int status() { return connected?WL_CONNECTED:0; } MockIP localIP() { return {}; } void reconnect() {}
};
inline MockWiFi WiFi;
