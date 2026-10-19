#pragma once
// Safe default. Hardware mode requires an explicit local build/config change.
#ifndef SIMULATION_MODE
#define SIMULATION_MODE 1
#endif
#if SIMULATION_MODE != 0 && SIMULATION_MODE != 1
#error "SIMULATION_MODE must be 0 or 1"
#endif
#if SIMULATION_MODE && ENABLE_SELFTEST_ENDPOINT
#error "Physical self-test endpoint is prohibited in simulation mode"
#endif
