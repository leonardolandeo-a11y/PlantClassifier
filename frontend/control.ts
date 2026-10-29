export type Command = "FORWARD" | "BACKWARD" | "LEFT" | "RIGHT" | "CENTER" | "STOP";
export interface Acknowledgement {
    status: "OK";
    command: Command;
    speed: number;
    simulated: boolean;
    sessionId: string;
    sequence: number;
}
export interface MovementRequest { command: Command; speed: number; sessionId: string; sequence: number; }
export interface Transport {
    acquire(): Promise<{sessionId: string}>;
    send(request: MovementRequest): Promise<Acknowledgement>;
}
const directions: Record<string, Command> = { w: "FORWARD", a: "LEFT", s: "BACKWARD", d: "RIGHT" };

export class KeyboardState {
    readonly pressedKeys = new Set<string>();
    press(key: string): void { if (key in directions) this.pressedKeys.add(key); }
    release(key: string): void { this.pressedKeys.delete(key); }
    clear(): void { this.pressedKeys.clear(); }
    command(): Command {
        // Last pressed key wins; releasing it resumes the last remaining held direction.
        return directions[Array.from(this.pressedKeys).at(-1) ?? ""] ?? "STOP";
    }
}

export class ControlRejected extends Error {}
export type ControlState = "IDLE" | "ACQUIRING" | "ACTIVE" | "STOPPING" | "ERROR";

export class MovementControl {
    private session: string | null = null;
    private sequence = 0;
    private generation = 0;
    private fault: string | null = null;
    private acquiring = false;
    private stopping = false;
    private inFlight: MovementRequest | null = null;
    private desired: Command = "STOP";
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

    set(command: Command): void {
        if (command === "STOP") { this.stop(); return; }
        this.desired = command;
        this.advance();
    }
    private advance(): void {
        if (this.acquiring || this.stopping || this.desired === "STOP") return;
        if (!this.session) { void this.acquire(); return; }
        if (!this.inFlight) { clearTimeout(this.timer); void this.pump(); }
    }
    private async acquire(): Promise<void> {
        this.fault = null;
        this.acquiring = true;
        const generation = this.generation;
        this.status("Connecting to ESP32…");
        try {
            const session = await this.transport.acquire();
            if (!/^[0-9a-f]{32}$/.test(session.sessionId)) throw new Error("Invalid control session");
            // A released key can never use this epoch, even if another key was pressed meanwhile.
            this.session = session.sessionId;
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
        const ack = await this.transport.send(request);
        if (!ack || ack.status !== "OK" || ack.sessionId !== request.sessionId ||
            ack.sequence !== request.sequence || ack.command !== request.command ||
            ack.speed !== request.speed || typeof ack.simulated !== "boolean")
            throw new Error("Invalid device acknowledgement");
        return ack;
    }
    private async pump(): Promise<void> {
        if (this.inFlight || !this.session || this.desired === "STOP") return;
        const generation = this.generation;
        const request: MovementRequest = {command: this.desired, speed: this.desired === "FORWARD" || this.desired === "BACKWARD" ? 150 : 0, sessionId: this.session, sequence: ++this.sequence};
        this.inFlight = request;
        try {
            const ack = await this.send(request);
            if (generation !== this.generation) return;
            const labels: Record<Command, string> = {FORWARD: "Moving forward", BACKWARD: "Moving backward", LEFT: "Turning left", RIGHT: "Turning right", CENTER: "Steering centered", STOP: "Stopped"};
            this.status(`${labels[ack.command]} — ${ack.command} accepted by ESP32${ack.simulated ? " (simulated)" : " (commanded; no motion feedback)"}`);
        } catch (error) {
            // Only obsolete protocol rejections are expected when priority STOP closes the epoch.
            // Network and invalid-ack failures remain visible, including on obsolete requests.
            if (generation === this.generation || !(error instanceof ControlRejected)) this.fail(error);
        } finally {
            if (this.inFlight === request) {
                this.inFlight = null;
                if (generation === this.generation && this.session) {
                    if (this.desired !== request.command) this.advance();
                    else this.timer = setTimeout(() => void this.pump(), 250);
                }
            }
        }
    }
    private fail(error: unknown): void {
        this.fault = `Connection lost / control unavailable: ${message(error)}. Release keys and press again.`;
        this.stop();
        this.failed();

        this.status(`Connection lost / control unavailable: ${message(error)}. Movement cancelled; release keys and press again.${this.stopping ? " STOP awaiting acknowledgement." : " Device state unconfirmed; watchdog remains active."}`);
    }
}
function message(error: unknown): string { return error instanceof Error ? error.message : "Communication failed"; }
