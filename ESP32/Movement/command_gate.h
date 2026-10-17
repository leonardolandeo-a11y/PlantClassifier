#pragma once
#include <stdint.h>

// Pure state machine, also exercised by host C++ tests. millis() rollover is intentional.
struct CommandGate {
  bool active = false;
  uint32_t sequence = 0;
  uint32_t lastCommand = 0;
  void begin(uint32_t now) { active = true; sequence = 0; lastCommand = now; }
  void invalidate() { active = false; }
  bool expired(uint32_t now) const { return active && uint32_t(now - lastCommand) > 1500; }
  bool accept(uint32_t next, uint32_t deadline, uint32_t now, bool stop) {
    if (!active || next == 0 || next <= sequence || next > 2147483647U) return false;
    if (!stop && (expired(now) || int32_t(deadline - now) <= 0 || int32_t(deadline - now) > 1500)) return false;
    sequence = next;
    lastCommand = now;
    if (stop) invalidate(); // STOP closes the epoch. No delayed command can reopen it.
    return true;
  }
};
