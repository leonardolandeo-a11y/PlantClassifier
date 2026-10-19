# Robot control protocol

The authenticated browser first sends `POST /movement/session` with CSRF protection. Spring calls the token-protected ESP32 `POST /control-session`. The device commands STOP, creates a random 128-bit epoch (`sessionId`) and returns its `millis()` as `deviceTimeMs`. Backend ownership is tied to the HTTP session. Acquiring control replaces any previous controller and stops the device.

Browser commands contain `command`, `speed`, `sessionId` and a strictly increasing integer `sequence` (1 through 2147483647). Commands normalize to uppercase. Spring adds `deadlineMs`, estimated in the device's uptime domain with a 1000 ms lifetime. Its estimate starts when the acquisition response arrives, so response transit shortens, rather than extends, useful command lifetime. Firmware rejects deadlines in the past or more than 1500 ms ahead, duplicate/lower sequences, old epochs and commands after an idle watchdog expiry. Arithmetic accounts for 32-bit `millis()` rollover.

**STOP closes the epoch**, both in Spring and firmware. Delayed commands cannot revive it, even with higher sequence values. A new epoch can only be acquired through the authenticated session endpoint, which itself commands STOP. Reconnect, refresh, request failure or idle expiry requires explicit reacquisition. After acquisition, press a movement key within 1.5 s; stopped sessions expire rather than remaining armed indefinitely. Backend restarts lose controller ownership; the device watchdog stops any remaining command.

The browser allows one outstanding normal request and schedules its next heartbeat 250 ms after completion. It stores only the latest desired direction. STOP is sent immediately with a higher sequence and may overtake that request. Old acknowledgement callbacks cannot change current state. Request failure clears keyboard state and releases control. No queued movement is retried automatically. Hardware safety does not depend on fetch cancellation.

W/A/S/D uses a set in press order: the most recently pressed key wins. Releasing it resumes the last remaining key; releasing an unrelated key does not stop a held direction. `LEFT`, `RIGHT`, and `CENTER` are steering-only and stop propulsion, so an old FORWARD cannot remain active after the W key is released. This is an intentional safety change from retained motor propulsion during steering. Simultaneous throttle and steering would require an explicitly expanded protocol and physical tests.

Blur, hidden page, page exit, focus entering a text input and the STOP button clear held keys and attempt STOP. When the network prevents acknowledgement, the UI reports unconfirmed STOP; firmware still has the original 1500 ms watchdog. Emergency physical shutdown remains necessary.

Acknowledgements include status, normalized command, commanded speed, simulation flag, session and sequence. Physical firmware may also return commanded motor/servo/PWM diagnostics. No wheel encoder is installed and physical motion is never confirmed by these fields.

Direct curl access to firmware needs `X-Device-Token`, a fresh session, sequence and a deadline based on `deviceTimeMs`. Keep both requests within the watchdog window; do not copy an old deadline. Normal curl use should go through Spring, which calculates deadlines.

The pure C++ gate is duplicated in each Arduino sketch folder to keep sketches independently uploadable. `scripts/test-firmware.sh` requires these files to remain identical and tests the gate on the host. Full Arduino compilation, HTTP execution on an ESP32 and physical motor tests are separate validations.

## Safe simulation and logout

Both sketches default to movement simulation with all actuator writes excluded. Movement also provides authenticated synthetic `/capture` by default. `/status` exposes `mode`, `hardwareOutputEnabled`, `sensorSimulated`, and `controlActive`. The HTTP command envelope is unchanged. Logout attempts STOP for the owning HTTP session and invalidates browser authentication. If delivery fails, the device watchdog still expires independently. See [USB simulation procedure](USB_SIMULATION.md).
