#pragma once
// Safe default. Hardware mode requires an explicit local build/config change.
#ifndef SIMULATION_MODE
#define SIMULATION_MODE 1
#endif
#ifndef SENSOR_SIMULATION_MODE
#if defined(REAL_SENSOR_MODE) && REAL_SENSOR_MODE
#define SENSOR_SIMULATION_MODE 0
#else
#define SENSOR_SIMULATION_MODE 1
#endif
#endif
#if (SIMULATION_MODE != 0 && SIMULATION_MODE != 1) || (SENSOR_SIMULATION_MODE != 0 && SENSOR_SIMULATION_MODE != 1)
#error "Simulation flags must be 0 or 1"
#endif
#if SIMULATION_MODE && ENABLE_SELFTEST_ENDPOINT
#error "Physical self-test endpoint is prohibited in simulation mode"
#endif
