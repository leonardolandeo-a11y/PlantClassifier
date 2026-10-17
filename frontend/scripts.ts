import {KeyboardState, MovementControl, type Acknowledgement, type MovementRequest} from "./control.js";
interface SensorData {
    ph: number; temperature: number; humidity: number; capturedAt: string | null;
    simulated: boolean | null; prediction: string | null; predictionStatus: string; predictionError: string | null;
}
function required<T extends Element>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(`Missing element: ${selector}`);
    return element;
}
const captureButton = required<HTMLButtonElement>("#CaptureData");
const buttonText = required<HTMLElement>("#buttonText");
const prediction = required<HTMLElement>("#prediction");
const movementStatus = required<HTMLElement>("#movementStatus");
const sensorStatus = required<HTMLElement>("#sensorStatus");
let csrf: {headerName: string; token: string} | undefined;
async function request<T>(url: string, body?: unknown, mutation = false): Promise<T | null> {
    if (mutation && !csrf) {
        const response = await fetch("/csrf", {cache: "no-store"});
        if (!response.ok) throw new Error("Unable to initialize session protection");
        csrf = await response.json() as typeof csrf;
    }
    const headers: Record<string, string> = {};
    if (csrf && mutation) headers[csrf.headerName] = csrf.token;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let response: Response;
    try {
        response = await fetch(url, {method: mutation ? "POST" : "GET", headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(url.startsWith("/movement") ? 1200 : 35000),
            keepalive: url === "/movement" && (body as MovementRequest)?.command === "STOP"});
    } catch { throw new Error("Network failure or request timeout — device state unconfirmed"); }
    if (!response.ok) {
        if (response.status === 401) throw new Error("Sign in to control the robot or capture sensors");
        if (response.status === 403) { csrf = undefined; throw new Error("Session protection expired; reload the page"); }
        if (response.status === 409) throw new Error("Command rejected: control expired or superseded");
        if (response.status === 504) throw new Error("Device timed out");
        if (response.status === 502) throw new Error("Device unreachable or invalid response");
        throw new Error(`Request failed (${response.status})`);
    }
    return response.status === 204 ? null : await response.json() as T;
}
function update(data: SensorData): void {
    required<HTMLElement>("#ph").textContent = data.ph.toFixed(2);
    required<HTMLElement>("#temperature").textContent = data.temperature.toFixed(1);
    required<HTMLElement>("#humidity").textContent = data.humidity.toFixed(1);
    prediction.textContent = data.predictionStatus === "SUCCEEDED" ? data.prediction :
        `Measurement saved — prediction ${data.predictionStatus.toLowerCase()}${data.predictionError ? ` (${data.predictionError})` : ""}`;
    sensorStatus.textContent = `${data.simulated === null ? "Origin unknown" : data.simulated ? "Simulated measurements" : "Sensor measurements"} · ${data.capturedAt ? new Date(data.capturedAt).toLocaleString() : "Legacy time unknown"}`;
}
async function load(): Promise<void> {
    try {
        const data = await request<SensorData>("/sensors");
        if (data) update(data); else sensorStatus.textContent = "No measurements yet";
    } catch (error) { sensorStatus.textContent = error instanceof Error ? error.message : "Unable to load sensors"; }
}
captureButton.addEventListener("click", () => {
    captureButton.disabled = true;
    buttonText.textContent = "Capturing…";
    void request<SensorData>("/sensors/capture", undefined, true).then(data => { if (data) update(data); })
        .catch((error: Error) => { sensorStatus.textContent = error.message; })
        .finally(() => { captureButton.disabled = false; buttonText.textContent = "Capture Data"; });
});
const keys = new KeyboardState();
const control = new MovementControl({
    async acquire() {
        const result = await request<{sessionId: string}>("/movement/session", undefined, true);
        if (!result) throw new Error("Empty controller response");
        return result;
    },
    async send(body) {
        const ack = await request<Acknowledgement>("/movement", body, true);
        if (!ack || ack.status !== "OK" || ack.sessionId !== body.sessionId || ack.sequence !== body.sequence)
            throw new Error("Invalid device acknowledgement");
        return ack;
    }
}, message => { movementStatus.textContent = message; }, () => keys.clear());
const acquireButton = required<HTMLButtonElement>("#AcquireControl");
acquireButton.addEventListener("click", () => {
    keys.clear(); acquireButton.disabled = true;
    void control.acquire().finally(() => { acquireButton.disabled = false; });
});
function stop(): void { keys.clear(); control.stop(); }
required<HTMLButtonElement>("#StopMovement").addEventListener("click", stop);
function typing(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && (target.isContentEditable || !!target.closest("input, textarea, select"));
}
document.addEventListener("keydown", event => {
    if (typing(event.target) || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (!["w", "a", "s", "d"].includes(key)) return;
    event.preventDefault(); keys.press(key); control.set(keys.command());
});
document.addEventListener("keyup", event => {
    const key = event.key.toLowerCase();
    if (!keys.pressedKeys.has(key)) return;
    keys.release(key); control.set(keys.command());
});
window.addEventListener("blur", stop);
window.addEventListener("pagehide", stop);
document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });
document.addEventListener("focusin", event => { if (typing(event.target)) stop(); });
void load();
