export type Command = "FORWARD" | "BACKWARD" | "LEFT" | "RIGHT" | "CENTER" | "STOP";
export type Steering = "LEFT" | "CENTER" | "RIGHT";
export type Intent = { command: Command; steering: Steering };
export function intent(keys: Iterable<string>): Intent {
    const held = [...keys];
    const propulsion = held.filter(k => k === "w" || k === "s").at(-1);
    const turn = held.filter(k => k === "a" || k === "d").at(-1);
    const steering = turn === "a" ? "LEFT" : turn === "d" ? "RIGHT" : "CENTER";
    return { command: propulsion === "w" ? "FORWARD" : propulsion === "s" ? "BACKWARD" : turn ? steering : "STOP", steering };
}
const powered = (command: Command) => command === "FORWARD" || command === "BACKWARD";
export interface Acknowledgement {
    steering?: Steering;
    protocolVersion?: number;
    status: "OK";
    command: Command;
    speed: number;
    simulated: boolean;
    sessionId: string;
    sequence: number;
}
export interface MovementRequest { steering?: Steering; command: Command; speed: number; sessionId: string; sequence: number; }
export interface Transport {
    acquire(): Promise<{sessionId: string; protocolVersion?: number}>;
    send(request: MovementRequest): Promise<Acknowledgement>;
}
const directions: Record<string, Command> = { w: "FORWARD", a: "LEFT", s: "BACKWARD", d: "RIGHT" };

export class KeyboardState {
    readonly pressedKeys = new Set<string>();
    press(key: string): void { if (key in directions) this.pressedKeys.add(key); }
    release(key: string): void { this.pressedKeys.delete(key); }
    clear(): void { this.pressedKeys.clear(); }
    intent(): Intent { return intent(this.pressedKeys); }
    command(): Command {
        return this.intent().command;
    }
}

export class ControlRejected extends Error {}
export type ControlState = "IDLE" | "ACQUIRING" | "ACTIVE" | "STOPPING" | "ERROR";

export class MovementControl {
    // Monotonic communication timings, not measured wheel speed. No per-heartbeat logging.
    readonly diagnostics = { acquisitionMs: 0, movementMs: 0, stopMs: 0,
        heartbeatGapMs: 0, maxHeartbeatGapMs: 0, failures: 0 };
    private lastSentAt: number | null = null;
    private lastSubmitted = "STOP";
    private disposed = false;
    private session: string | null = null;
    private protocolVersion: number | undefined;
    private sequence = 0;
    private generation = 0;
    private fault: string | null = null;
    private acquiring = false;
    private stopping = false;
    private inFlight: MovementRequest | null = null;
    private desired: Command = "STOP";
    private steering: Steering | undefined;
    private timer: ReturnType<typeof setTimeout> | undefined;
    constructor(private transport: Transport, private status: (message: string) => void,
                private failed: () => void) {}

    // UI state is derived; the flags track asynchronous work that can overlap during STOP.
    get state(): ControlState {
        if (this.fault) return "ERROR";
        if (this.stopping || (this.acquiring && this.desired === "STOP")) return "STOPPING";
        if (this.acquiring) return "ACQUIRING";
        return this.session ? "ACTIVE" : "IDLE";
    }

    dispose(): void { this.disposed = true; this.stop(); }

    set(command: Command, steering?: Steering): void {
        if (this.disposed) return;
        if (command === "STOP") { this.stop(); return; }
        // Zero propulsion overtakes any pending powered request and invalidates its epoch.
        if (!powered(command) && (powered(this.desired) || (this.inFlight && powered(this.inFlight.command)))) this.stop();
        this.desired = command;
        this.steering = steering;
        this.advance();
    }
    private advance(): void {
        if (this.disposed || this.acquiring || this.stopping || this.desired === "STOP") return;
        if (!this.session) { void this.acquire(); return; }
        if (!this.inFlight) { clearTimeout(this.timer); void this.pump(); }
    }
    private async acquire(): Promise<void> {
        this.fault = null;
        this.acquiring = true;
        const generation = this.generation;
        const started = performance.now();
        this.status("Connecting to ESP32…");
        try {
            const session = await this.transport.acquire();
            this.diagnostics.acquisitionMs = performance.now() - started;
            this.lastSentAt = null;
            if (!/^[0-9a-f]{32}$/.test(session.sessionId)) throw new Error("Invalid control session");
            // A released key can never use this epoch, even if another key was pressed meanwhile.
            this.session = session.sessionId;
            this.protocolVersion = session.protocolVersion;
            this.sequence = 0;
            if (generation !== this.generation || this.desired === "STOP") {
                await this.closeSession();
            }
        } catch (error) { this.fail(error); }
        finally { this.acquiring = false; this.advance(); }
    }
    stop(): void {
        clearTimeout(this.timer);
        this.desired = "STOP";
        this.lastSubmitted = "STOP";
        this.generation++;
        this.inFlight = null;
        if (this.session) void this.closeSession();
        else if (this.acquiring || this.stopping) {
            this.status("Movement cancelled — awaiting STOP acknowledgement");
        }
    }
    private async closeSession(): Promise<void> {
        const session = this.session;
        if (!session) return;
        this.session = null;
        this.stopping = true;
        const request: MovementRequest = {command: "STOP", speed: 0, sessionId: session, sequence: ++this.sequence};
        this.status("STOP submitted — awaiting device acknowledgement");
        try {
            const ack = await this.send(request);

            this.status(`${this.fault ? this.fault + " · " : ""}Stopped — STOP accepted by ESP32${ack.simulated ? " (simulated)" : " (commanded state)"}`);
        } catch (error) {
            this.fault = message(error);
            this.desired = "STOP";
            this.generation++;
            this.failed();

            this.status(`Connection lost / control unavailable. STOP unconfirmed: ${message(error)}. Device watchdog remains active. Release keys and press again.`);
        } finally { this.stopping = false; this.advance(); }
    }
    private async send(request: MovementRequest): Promise<Acknowledgement> {
        const started = performance.now();
        let ack: Acknowledgement;
        try { ack = await this.transport.send(request); }
        finally {
            if (request.command === "STOP") this.diagnostics.stopMs = performance.now() - started;
            else this.diagnostics.movementMs = performance.now() - started;
        }
        if (!ack || ack.status !== "OK" || ack.sessionId !== request.sessionId ||
            ack.sequence !== request.sequence || ack.command !== request.command ||
            (request.steering !== undefined && (ack.steering !== request.steering || ack.protocolVersion !== 2)) ||
            ack.speed !== request.speed || typeof ack.simulated !== "boolean")
            throw new Error("Invalid device acknowledgement");
        return ack;
    }
    private async pump(): Promise<void> {
        if (this.inFlight || !this.session || this.desired === "STOP") return;
        if (this.steering !== undefined && this.protocolVersion !== 2) {
            this.fail(new Error("Combined control requires backend and firmware protocol v2")); return;
        }
        const generation = this.generation;
        const request: MovementRequest = {command: this.desired, steering: this.steering, speed: this.desired === "FORWARD" || this.desired === "BACKWARD" ? 150 : 0, sessionId: this.session, sequence: ++this.sequence};
        const started = performance.now();
        if (this.lastSentAt !== null) {
            this.diagnostics.heartbeatGapMs = started - this.lastSentAt;
            this.diagnostics.maxHeartbeatGapMs = Math.max(this.diagnostics.maxHeartbeatGapMs, this.diagnostics.heartbeatGapMs);
        }
        this.lastSentAt = started;
        this.inFlight = request;
        const submitted = `${request.command} · steering ${request.steering ?? "legacy"}`;
        if (submitted !== this.lastSubmitted) {
            this.lastSubmitted = submitted;
            this.status(`${submitted} submitted — awaiting device acknowledgement`);
        }
        try {
            const ack = await this.send(request);
            if (generation !== this.generation) return;
            const labels: Record<Command, string> = {FORWARD: "Moving forward", BACKWARD: "Moving backward", LEFT: "Turning left", RIGHT: "Turning right", CENTER: "Steering centered", STOP: "Stopped"};
            this.status(`${labels[ack.command]}${ack.steering ? " · steering " + ack.steering : ""} — ${ack.command} accepted by ESP32${ack.simulated ? " (simulated)" : " (commanded; no motion feedback)"}`);
        } catch (error) {
            // Only obsolete protocol rejections are expected when priority STOP closes the epoch.
            // Network and invalid-ack failures remain visible, including on obsolete requests.
            if (generation === this.generation || !(error instanceof ControlRejected)) this.fail(error);
        } finally {
            if (this.inFlight === request) {
                this.inFlight = null;
                if (generation === this.generation && this.session) {
                    if (this.desired !== request.command || this.steering !== request.steering) this.advance();
                    // Target start-to-start cadence, with one request in flight and no catch-up queue.
                    else this.timer = setTimeout(() => void this.pump(), Math.max(0, 250 - (performance.now() - started)));
                }
            }
        }
    }
    private fail(error: unknown): void {
        this.diagnostics.failures++;
        this.fault = `Connection lost / control unavailable: ${message(error)}. Release keys and press again.`;
        this.stop();
        this.failed();

        this.status(`Connection lost / control unavailable: ${message(error)}. Movement cancelled; release keys and press again.${this.stopping ? " STOP awaiting acknowledgement." : " Device state unconfirmed; watchdog remains active."}`);
    }
}
function message(error: unknown): string { return error instanceof Error ? error.message : "Communication failed"; }
