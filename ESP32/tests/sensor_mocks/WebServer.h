#pragma once
#include <functional>
#include <map>
constexpr int HTTP_GET=0, HTTP_POST=1;
struct WebServer {
 std::map<std::pair<String,int>,std::function<void()>> routes;
 std::function<void()> missing;
 String token, body, input;
 String arg(const char*) { return input; }
 int status=0;
 explicit WebServer(int) {}
 String header(const char*) { return token; }
 void send(int code,const char*,const String& value) { status=code; body=value; }
 void collectHeaders(const char**,int) {}
 void on(const char* path,int method,std::function<void()> handler) { routes[{path,method}]=handler; }
 void onNotFound(std::function<void()> handler) { missing=handler; }
 void begin() {} void handleClient() {}
 void request(const String& path, int method=HTTP_GET) { auto route=routes.find({path,method}); if(route==routes.end()) missing(); else route->second(); }
};
