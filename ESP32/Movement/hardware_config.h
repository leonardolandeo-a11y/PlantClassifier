#pragma once
// Existing wiring. Channel B has no assigned pins and is not controlled.
constexpr int SERVO_PIN = 22;
constexpr int PWMA = 27;
constexpr int AIN1 = 25;
constexpr int AIN2 = 26;
constexpr int STBY = 32;
constexpr int PWM_FREQUENCY = 5000;
constexpr int PWM_RESOLUTION = 8;
// Classic ESP32: motor channel 2 uses timer 1; servo is restricted to timer 0.
constexpr int MOTOR_PWM_CHANNEL = 2;
// UNCALIBRATED legacy values. Verify pulse limits and linkage before powering servo.
constexpr int SERVO_CENTER = 100;
constexpr int SERVO_LEFT = 70;
constexpr int SERVO_RIGHT = 130;
constexpr int SERVO_MIN_US = 500;
constexpr int SERVO_MAX_US = 2400;
// Minimum electrical interlock, NOT proof that the shaft has stopped.
// Increase after measuring coast-down time under worst-case load.
constexpr uint32_t REVERSAL_DEADTIME_MS = 500;
constexpr unsigned long COMMAND_TIMEOUT_MS = 1500;
static_assert(0 <= SERVO_LEFT && SERVO_LEFT <= SERVO_CENTER &&
              SERVO_CENTER <= SERVO_RIGHT && SERVO_RIGHT <= 180, "Invalid steering angles");
static_assert(SERVO_MIN_US >= 500 && SERVO_MAX_US <= 2500 && SERVO_MIN_US < SERVO_MAX_US,
              "Invalid servo pulse range");
static_assert(REVERSAL_DEADTIME_MS > 0 && REVERSAL_DEADTIME_MS < 0x80000000U,
              "Invalid reversal interval");
