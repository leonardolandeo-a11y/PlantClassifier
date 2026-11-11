#pragma once
#include <functional>
#include <map>
constexpr int HTTP_GET=0, HTTP_POST=1;
struct WebServer {
 std::map<String,std::function<void()>> routes;
 String token, body, input;
 int status=0;
 explicit WebServer(int) {}
 String header(const char*) { return token; }
 bool hasArg(const char*) { return !input.empty(); }
 String arg(const char*) { return input; }
 void send(int code,const char*,const String& value) { status=code; body=value; }
 void collectHeaders(const char**,int) {}
 void on(const char* path,int,std::function<void()> handler) { routes[path]=handler; }
 void begin() {} void handleClient() {}
 void request(const String& path) { auto r=routes.find(path); if(r==routes.end()) status=404; else r->second(); }
};
