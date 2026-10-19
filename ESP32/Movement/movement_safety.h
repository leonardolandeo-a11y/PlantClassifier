#pragma once
// Called before HTTP handling and again after it. Never restores a command.
void checkMovementSafety(bool connected, uint32_t now) {
  const bool motionTimedOut = (driveDirection != 0 || currentAngle != SERVO_CENTER) &&
                              uint32_t(now - lastCommandTime) > COMMAND_TIMEOUT_MS;
  if (!connected || gate.expired(now) || motionTimedOut) {
    if (gate.active || driveDirection != 0 || currentAngle != SERVO_CENTER)
      Serial.println("[FAILSAFE] Control lost -> STOP");
    gate.invalidate();
    robotStop();
  }
}
