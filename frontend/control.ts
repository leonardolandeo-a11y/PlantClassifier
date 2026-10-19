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

export class MovementControl {
    private session: string | null = null;
    private sequence = 0;
    private generation = 0;
    private busy = false;
    private desired: Command = "STOP";
    private timer: ReturnType<typeof setTimeout> | undefined;
    constructor(private transport: Transport, private status: (message: string) => void,
                private failed: () => void) {}

    async acquire(): Promise<void> {
        this.stop();
        const generation = ++this.generation;
        this.status("Acquiring control; robot commanded to STOP…");
        try {
            const session = await this.transport.acquire();
            if (generation !== this.generation) return;
            this.session = session.sessionId;
            this.sequence = 0;
            this.status("Control ready — press a direction within 1.5 s");
            this.timer = setTimeout(() => {
                if (generation !== this.generation || this.desired !== "STOP") return;
                this.stop("Control expired; acquire again"); this.failed();
            }, 1500);
        } catch (error) { if (generation === this.generation) this.fail(error); }
    }
    set(command: Command): void {
        if (command === "STOP") { this.stop(); return; }
        if (!this.session) { this.status("Acquire control before moving"); return; }
        this.desired = command;
        if (!this.busy) { clearTimeout(this.timer); void this.pump(); }
    }
    stop(reason = ""): void {
        clearTimeout(this.timer);
        const session = this.session;
        this.session = null;
        this.desired = "STOP";
        this.generation++;
        if (!session) return;
        // One priority STOP may overlap the single normal request; its higher sequence closes the epoch.
        const request: MovementRequest = {command: "STOP", speed: 0, sessionId: session, sequence: ++this.sequence};
        const generation = this.generation;
        this.status("STOP submitted — awaiting device acknowledgement");
        void this.transport.send(request).then(ack => {
            if (generation === this.generation) this.status(`${reason ? reason + " · " : ""}STOP accepted by ESP32${ack.simulated ? " (simulated)" : " (commanded state)"}`);
        }).catch(error => {
            if (generation === this.generation) this.status(`${reason ? reason + " · " : ""}STOP unconfirmed: ${message(error)}. Device watchdog remains active.`);
        });
    }
    private async pump(): Promise<void> {
        if (this.busy || !this.session || this.desired === "STOP") return;
        this.busy = true;
        const generation = this.generation;
        const request: MovementRequest = {command: this.desired, speed: this.desired === "FORWARD" || this.desired === "BACKWARD" ? 150 : 0, sessionId: this.session, sequence: ++this.sequence};
        this.status(`${request.command} submitted…`);
        try {
            const ack = await this.transport.send(request);
            if (generation !== this.generation) return;
            this.status(`${ack.command} accepted by ESP32${ack.simulated ? " (simulated)" : " (commanded; no motion feedback)"}`);
        } catch (error) {
            if (generation === this.generation) this.fail(error);
        } finally {
            this.busy = false;
            if (this.session) this.timer = setTimeout(() => void this.pump(), 250);
        }
    }
    private fail(error: unknown): void {
        this.stop();
        this.failed();
        this.status(`${message(error)}. Control released; acquire again.`);
    }
}
function message(error: unknown): string { return error instanceof Error ? error.message : "Communication failed"; }
