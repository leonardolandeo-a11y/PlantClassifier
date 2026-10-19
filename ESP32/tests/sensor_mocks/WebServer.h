#pragma once
#include <functional>
#include <map>
constexpr int HTTP_GET=0;
struct WebServer {
 std::map<String,std::function<void()>> routes;
 std::function<void()> missing;
 String token, body;
 int status=0;
 explicit WebServer(int) {}
 String header(const char*) { return token; }
 void send(int code,const char*,const String& value) { status=code; body=value; }
 void collectHeaders(const char**,int) {}
 void on(const char* path,int,std::function<void()> handler) { routes[path]=handler; }
 void onNotFound(std::function<void()> handler) { missing=handler; }
 void begin() {} void handleClient() {}
 void request(const String& path) { auto route=routes.find(path); if(route==routes.end()) missing(); else route->second(); }
};
