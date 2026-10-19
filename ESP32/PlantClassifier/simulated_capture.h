#pragma once
// Fixed synthetic fixture: deterministic, plausible and inside backend validation ranges.
void simulatedCapture() {
  if (!authorized()) return;
  Serial.println("[SENSOR] SIMULATION ph=6.5 temperature=25.0 humidity=60.0");
  server.send(200, "application/json", "{\"ph\":6.5,\"temperature\":25.0,\"humidity\":60.0,\"simulated\":true}");
}
