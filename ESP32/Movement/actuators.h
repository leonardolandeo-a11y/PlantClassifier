#pragma once
// Production actuator functions, exercised on the host with mocked Arduino I/O.
#include "hardware_config.h"
#if !SIMULATION_MODE
#if !defined(CONFIG_IDF_TARGET_ESP32)
#error "Movement hardware pin/timer mapping requires a classic ESP32"
#endif
Servo steeringServo;
#endif
bool servoOK = false;
bool pwmOK = false;
bool lastPWMWriteOK = false;
int currentAngle = SERVO_CENTER;
int currentSpeed = 0;
int driveDirection = 0;
int lastPoweredDirection = 0;
uint32_t motorStoppedAt = 0;
unsigned long lastCommandTime = 0;

void motorStop() {
#if !SIMULATION_MODE
  // Disable bridge BEFORE touching PWM/direction, even if LEDC has failed.
  digitalWrite(STBY, LOW);
  if (pwmOK) {
    lastPWMWriteOK = ledcWrite(PWMA, 0);
    if (!lastPWMWriteOK) pwmOK = false; // Latch fault until restart.
  }
  digitalWrite(AIN1, LOW);
  digitalWrite(AIN2, LOW);
  if (driveDirection != 0) motorStoppedAt = millis();
#endif
  driveDirection = 0;
  currentSpeed = 0;
}

bool motorDrive(int direction, int speed) {
  if (direction < -1 || direction > 1) { motorStop(); return false; }
  speed = constrain(speed, 0, 255);
  if (direction == 0 || speed == 0) { motorStop(); return true; }
#if SIMULATION_MODE
  driveDirection = direction;
  currentSpeed = speed;
  return true;
#else
  if (!pwmOK || !servoOK) { motorStop(); return false; }
  if (lastPoweredDirection != 0 && lastPoweredDirection != direction) {
    motorStop();
    // Reject, never delay or queue a restart. The caller invalidates the session.
    // Also applies after STOP, steering commands and acquisition of a new session.
    if (!pwmOK || uint32_t(millis() - motorStoppedAt) < REVERSAL_DEADTIME_MS) return false;
  }
  digitalWrite(STBY, LOW);
  digitalWrite(AIN1, direction > 0 ? HIGH : LOW);
  digitalWrite(AIN2, direction < 0 ? HIGH : LOW);
  lastPWMWriteOK = ledcWrite(PWMA, speed);
  if (!lastPWMWriteOK) {
    pwmOK = false;
    motorStop();
    return false;
  }
  digitalWrite(STBY, HIGH); // Enable only after direction and duty are established.
  lastPoweredDirection = driveDirection = direction;
  currentSpeed = speed;
  return true;
#endif
}

void servoMove(int angle) {
#if !SIMULATION_MODE
  if (!servoOK) return;
#endif
  currentAngle = constrain(angle, SERVO_LEFT, SERVO_RIGHT);
#if !SIMULATION_MODE
  steeringServo.write(currentAngle);
#endif
}

void robotStop() {
  motorStop();
  servoMove(SERVO_CENTER); // Requires verified neutral/clearance; does not disconnect servo power.
}

void setupHardware() {
#if SIMULATION_MODE
  Serial.println("[MODE] SIMULATION - HARDWARE OUTPUT DISABLED");
#else
  Serial.println("[MODE] HARDWARE - actuator supply must be independently disconnectable");
  // External STBY pull-down is REQUIRED during reset/before firmware executes.
  digitalWrite(STBY, LOW);
  pinMode(STBY, OUTPUT);
  digitalWrite(AIN1, LOW); digitalWrite(AIN2, LOW); digitalWrite(PWMA, LOW);
  pinMode(AIN1, OUTPUT); pinMode(AIN2, OUTPUT); pinMode(PWMA, OUTPUT);
  // Keep distinct timers: servo at 50 Hz, motor at 5 kHz.
  ESP32PWM::allocateTimer(0);
  steeringServo.setPeriodHertz(50);
  steeringServo.attach(SERVO_PIN, SERVO_MIN_US, SERVO_MAX_US);
  servoOK = steeringServo.attached();
  if (servoOK) servoMove(SERVO_CENTER);
  pwmOK = ledcAttachChannel(PWMA, PWM_FREQUENCY, PWM_RESOLUTION, MOTOR_PWM_CHANNEL);
  motorStop();
  Serial.printf("[INIT] SERVO attached=%d PWM ready=%d STBY=%d\n", servoOK, pwmOK, digitalRead(STBY));
  // No drive permitted if either initialization failed. No automatic fault recovery.
#endif
}
