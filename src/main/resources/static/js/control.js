const directions = { w: "FORWARD", a: "LEFT", s: "BACKWARD", d: "RIGHT" };
export class KeyboardState {
    pressedKeys = new Set();
    press(key) { if (key in directions)
        this.pressedKeys.add(key); }
    release(key) { this.pressedKeys.delete(key); }
    clear() { this.pressedKeys.clear(); }
    command() {
        // Last pressed key wins; releasing it resumes the last remaining held direction.
        return directions[Array.from(this.pressedKeys).at(-1) ?? ""] ?? "STOP";
    }
}
export class ControlRejected extends Error {
}
export class MovementControl {
    transport;
    status;
    failed;
    state = "IDLE";
    session = null;
    sequence = 0;
    generation = 0;
    fault = null;
    acquiring = false;
    stopping = false;
    inFlight = null;
    desired = "STOP";
    timer;
    constructor(transport, status, failed) {
        this.transport = transport;
        this.status = status;
        this.failed = failed;
    }
    set(command) {
        if (command === "STOP") {
            this.stop();
            return;
        }
        this.desired = command;
        this.advance();
    }
    advance() {
        if (this.acquiring || this.stopping || this.desired === "STOP")
            return;
        if (!this.session) {
            void this.acquire();
            return;
        }
        if (!this.inFlight) {
            clearTimeout(this.timer);
            void this.pump();
        }
    }
    async acquire() {
        this.fault = null;
        this.acquiring = true;
        const generation = this.generation;
        this.state = "ACQUIRING";
        this.status("Connecting to ESP32…");
        try {
            const session = await this.transport.acquire();
            if (!/^[0-9a-f]{32}$/.test(session.sessionId))
                throw new Error("Invalid control session");
            // A released key can never use this epoch, even if another key was pressed meanwhile.
            this.session = session.sessionId;
            this.sequence = 0;
            if (generation !== this.generation || this.desired === "STOP") {
                await this.closeSession();
            }
            else {
                this.state = "ACTIVE";
            }
        }
        catch (error) {
            this.fail(error);
        }
        finally {
            this.acquiring = false;
            this.advance();
        }
    }
    stop() {
        clearTimeout(this.timer);
        this.desired = "STOP";
        this.generation++;
        this.inFlight = null;
        if (this.session)
            void this.closeSession();
        else if (this.acquiring || this.stopping) {
            this.state = "STOPPING";
            this.status("Movement cancelled — awaiting STOP acknowledgement");
        }
    }
    async closeSession() {
        const session = this.session;
        if (!session)
            return;
        this.session = null;
        this.stopping = true;
        this.state = "STOPPING";
        const request = { command: "STOP", speed: 0, sessionId: session, sequence: ++this.sequence };
        this.status("STOP submitted — awaiting device acknowledgement");
        try {
            const ack = await this.send(request);
            this.state = this.fault ? "ERROR" : "IDLE";
            this.status(`${this.fault ? this.fault + " · " : ""}Stopped — STOP accepted by ESP32${ack.simulated ? " (simulated)" : " (commanded state)"}`);
        }
        catch (error) {
            this.desired = "STOP";
            this.generation++;
            this.failed();
            this.state = "ERROR";
            this.status(`Connection lost / control unavailable. STOP unconfirmed: ${message(error)}. Device watchdog remains active. Release keys and press again.`);
        }
        finally {
            this.stopping = false;
            this.advance();
        }
    }
    async send(request) {
        const ack = await this.transport.send(request);
        if (!ack || ack.status !== "OK" || ack.sessionId !== request.sessionId ||
            ack.sequence !== request.sequence || ack.command !== request.command ||
            ack.speed !== request.speed || typeof ack.simulated !== "boolean")
            throw new Error("Invalid device acknowledgement");
        return ack;
    }
    async pump() {
        if (this.inFlight || !this.session || this.desired === "STOP")
            return;
        const generation = this.generation;
        const request = { command: this.desired, speed: this.desired === "FORWARD" || this.desired === "BACKWARD" ? 150 : 0, sessionId: this.session, sequence: ++this.sequence };
        this.inFlight = request;
        try {
            const ack = await this.send(request);
            if (generation !== this.generation)
                return;
            const labels = { FORWARD: "Moving forward", BACKWARD: "Moving backward", LEFT: "Turning left", RIGHT: "Turning right", CENTER: "Steering centered", STOP: "Stopped" };
            this.status(`${labels[ack.command]} — ${ack.command} accepted by ESP32${ack.simulated ? " (simulated)" : " (commanded; no motion feedback)"}`);
        }
        catch (error) {
            // Only obsolete protocol rejections are expected when priority STOP closes the epoch.
            // Network and invalid-ack failures remain visible, including on obsolete requests.
            if (generation === this.generation || !(error instanceof ControlRejected))
                this.fail(error);
        }
        finally {
            if (this.inFlight === request) {
                this.inFlight = null;
                if (generation === this.generation && this.session) {
                    if (this.desired !== request.command)
                        this.advance();
                    else
                        this.timer = setTimeout(() => void this.pump(), 250);
                }
            }
        }
    }
    fail(error) {
        this.fault = `Connection lost / control unavailable: ${message(error)}. Release keys and press again.`;
        this.stop();
        this.failed();
        this.state = "ERROR";
        this.status(`Connection lost / control unavailable: ${message(error)}. Movement cancelled; release keys and press again.${this.stopping ? " STOP awaiting acknowledgement." : " Device state unconfirmed; watchdog remains active."}`);
    }
}
function message(error) { return error instanceof Error ? error.message : "Communication failed"; }
