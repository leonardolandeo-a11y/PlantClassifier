#include "../Movement/command_gate.h"
#include <cassert>
#include <iostream>
int main() {
  CommandGate gate;
  assert(!gate.accept(1,1000,0,false));
  gate.begin(100);
  assert(gate.accept(1,1100,101,false));
  assert(!gate.accept(1,1100,102,false)); // duplicate
  assert(!gate.accept(0,1100,102,false)); // invalid
  assert(gate.accept(3,1100,103,true)); // STOP overtakes delayed sequence 2
  assert(!gate.accept(2,1100,104,false));
  assert(!gate.accept(4,1100,105,false)); // STOP closes epoch even for higher sequences
  gate.begin(200);
  assert(!gate.accept(1,199,200,false)); // expired deadline
  assert(!gate.accept(1,2000,200,false)); // excessively distant deadline
  assert(gate.expired(1701));
  assert(!gate.accept(1,2700,1701,false)); // watchdog
  gate.begin(0xfffffff0U);
  assert(gate.accept(1,0x100U,0xfffffff5U,false)); // millis rollover
  gate.invalidate(); assert(!gate.accept(2,0x100U,0xfffffff6U,false)); // Wi-Fi disconnect
  std::cout << "Command gate: all checks passed\n";
}
