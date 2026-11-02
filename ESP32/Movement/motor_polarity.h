#pragma once
// Single electrical polarity setting. -1 reverses the previous mapping, based on
// the reported W/S behavior. Must be verified on the assembled robot with wheels
// raised; software tests prove pin levels only. Never invert commands elsewhere.
constexpr int MOTOR_POLARITY = -1;
static_assert(MOTOR_POLARITY == 1 || MOTOR_POLARITY == -1, "Invalid motor polarity");
