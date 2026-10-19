#pragma once
void protocolError(int status, const char* message) {
  JsonDocument result;
  result["error"] = message;
  String body;
  serializeJson(result, body);
  server.send(status, "application/json", body);
}
bool authorized() {
  String supplied = server.header("X-Device-Token");
  size_t length = strlen(DEVICE_TOKEN);
  unsigned int difference = supplied.length() ^ length;
  for (size_t i = 0; i < length; ++i)
    difference |= uint8_t(DEVICE_TOKEN[i]) ^ uint8_t(i < supplied.length() ? supplied[i] : 0);
  if (length < 32 || strncmp(DEVICE_TOKEN, "REPLACE_", 8) == 0 || difference != 0) {
    protocolError(401, "Unauthorized");
    return false;
  }
  return true;
}
