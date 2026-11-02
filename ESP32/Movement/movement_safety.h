#pragma once
uint32_t watchdogStops = 0;
uint32_t sessionExpirations = 0;
uint32_t wifiStops = 0;

// Called before HTTP handling and again after it. Never restores a command.
void checkMovementSafety(bool connected, uint32_t now) {
  const bool motionTimedOut = (driveDirection != 0 || currentAngle != SERVO_CENTER) &&
                              uint32_t(now - lastCommandTime) > COMMAND_TIMEOUT_MS;
  if (!connected || gate.expired(now) || motionTimedOut) {
    if (gate.active || driveDirection != 0 || currentAngle != SERVO_CENTER) {
      if (!connected) ++wifiStops;
      if (gate.expired(now)) ++sessionExpirations;
      if (motionTimedOut) ++watchdogStops;
      Serial.printf("[FAILSAFE] wifi=%d sessionExpired=%d watchdog=%d -> STOP\n",
                    connected, gate.expired(now), motionTimedOut);
    }
    gate.invalidate();
    robotStop();
  }
}
