# Robot control protocol

The local browser with an anonymous HTTP session first sends `POST /movement/session` with CSRF protection. Spring calls the token-protected ESP32 `POST /control-session`. The device commands STOP, creates a random 128-bit epoch (`sessionId`) and returns its `millis()` as `deviceTimeMs`. Backend ownership is tied to the HTTP session. Acquiring control replaces any previous controller and stops the device.

Browser commands contain `command`, `speed`, `sessionId` and a strictly increasing integer `sequence` (1 through 2147483647). Commands normalize to uppercase. Spring adds `deadlineMs`, estimated in the device's uptime domain with a 1000 ms lifetime. Its estimate starts when the acquisition response arrives, so response transit shortens, rather than extends, useful command lifetime. Firmware rejects deadlines in the past or more than 1500 ms ahead, duplicate/lower sequences, old epochs and commands after an idle watchdog expiry. Arithmetic accounts for 32-bit `millis()` rollover.

**STOP closes the epoch**, both in Spring and firmware. Delayed commands cannot revive it, even with higher sequence values. A new epoch can only be acquired through the CSRF-protected session endpoint, which itself commands STOP. The first intentional W/A/S/D keypress automatically acquires a session. Each fresh action after STOP acquires a new session. Reconnect, refresh or request failure requires a fresh keypress; held-key repeats never reacquire control. Backend restarts lose controller ownership; the device watchdog stops any remaining command.

The browser allows one outstanding normal request and schedules its next heartbeat 250 ms after completion. It stores only the latest desired direction. STOP is sent immediately with a higher sequence and may overtake that request. The frontend uses IDLE, ACQUIRING, ACTIVE, STOPPING and ERROR states. Acquisition is single-flight. Releasing all keys during acquisition cancels that intent and sends STOP against the returned session without sending movement. Fresh intent waits for that STOP acknowledgement before acquiring another session. Old acknowledgement callbacks cannot change current movement state. An obsolete HTTP 409 after cancellation is expected and does not replace STOP feedback; network errors and malformed acknowledgements remain visible. STOP is only confirmed by a matching acknowledgement. Request failure clears keyboard state and releases control. No queued movement is retried automatically. Hardware safety does not depend on fetch cancellation.

W/A/S/D uses a set in press order: the most recently pressed key wins. Releasing it resumes the last remaining key; releasing an unrelated key does not stop a held direction. `LEFT`, `RIGHT`, and `CENTER` are steering-only and stop propulsion, so an old FORWARD cannot remain active after the W key is released. This is an intentional safety change from retained motor propulsion during steering. Simultaneous throttle and steering would require an explicitly expanded protocol and physical tests.

Blur, hidden page, page exit, focus entering a text input and the STOP button clear held keys and attempt STOP. When the network prevents acknowledgement, the UI reports unconfirmed STOP; firmware still has the original 1500 ms watchdog. Emergency physical shutdown remains necessary.

Acknowledgements include status, normalized command, commanded speed, simulation flag, session and sequence. Physical firmware may also return commanded motor/servo/PWM diagnostics. No wheel encoder is installed and physical motion is never confirmed by these fields.

Direct curl access to firmware needs `X-Device-Token`, a fresh session, sequence and a deadline based on `deviceTimeMs`. Keep both requests within the watchdog window; do not copy an old deadline. Normal curl use should go through Spring, which calculates deadlines.

The pure C++ command gate belongs only to the movement sketch. `scripts/test-firmware.sh` tests it, the actuators and the sensor sketch on the host. Full Arduino compilation, HTTP execution on an ESP32 and physical motor tests are separate validations.

## Safe simulation and anonymous sessions

The movement sketch defaults to simulation with actuator writes excluded and has no `/capture`. Its `/status` exposes `mode`, `hardwareOutputEnabled`, and `controlActive`. The separate sensor sketch reads DHT11 and a pH demonstration potentiometer, and exposes only `/status` and `/capture`. Software-only simulation uses two Python servers. The HTTP command envelope is unchanged. There is no login or logout. The anonymous HTTP session still identifies the controller; key release, loss of focus and page exit attempt STOP. If delivery fails or the HTTP session expires, the device watchdog still expires independently. See [setup and USB procedure](SETUP.md).

## Physical actuator interlocks

See [real hardware setup](REAL_HARDWARE_SETUP.md) before activation. Hardware mode rejects
propulsion unless both motor PWM and steering initialize. An abrupt opposite direction
stops immediately, returns 409 and invalidates the session; there is no delayed reversal.
A fresh keypress/session after physical rest and the minimum reversal interval is required.
The interval also survives STOP/session acquisition. PWM faults return 503 and latch
unavailable until restart. The keyboard/API contract and simulation behavior are unchanged.
