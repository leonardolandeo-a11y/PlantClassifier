import { KeyboardState, MovementControl } from "./control.js";
function required(selector) {
    const element = document.querySelector(selector);
    if (!element)
        throw new Error(`Missing element: ${selector}`);
    return element;
}
const captureButton = required("#CaptureData");
const buttonText = required("#buttonText");
const prediction = required("#prediction");
const movementStatus = required("#movementStatus");
const sensorStatus = required("#sensorStatus");
let csrf;
async function request(url, body, mutation = false) {
    if (mutation && !csrf) {
        const response = await fetch("/csrf", { cache: "no-store" });
        if (!response.ok)
            throw new Error("Unable to initialize session protection");
        csrf = await response.json();
    }
    const headers = {};
    if (csrf && mutation)
        headers[csrf.headerName] = csrf.token;
    if (body !== undefined)
        headers["Content-Type"] = "application/json";
    let response;
    try {
        response = await fetch(url, { method: mutation ? "POST" : "GET", headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(url.startsWith("/movement") ? 1200 : 35000),
            keepalive: url === "/movement" && body?.command === "STOP" });
    }
    catch {
        throw new Error("Network failure or request timeout — device state unconfirmed");
    }
    if (!response.ok) {
        if (response.status === 401)
            throw new Error("Sign in to control the robot or capture sensors");
        if (response.status === 403) {
            csrf = undefined;
            throw new Error("Session protection expired; reload the page");
        }
        if (response.status === 409)
            throw new Error("Command rejected: control expired or superseded");
        if (response.status === 504)
            throw new Error("Device timed out");
        if (response.status === 502)
            throw new Error("Device unreachable or invalid response");
        throw new Error(`Request failed (${response.status})`);
    }
    return response.status === 204 ? null : await response.json();
}
function update(data) {
    required("#ph").textContent = data.ph.toFixed(2);
    required("#temperature").textContent = data.temperature.toFixed(1);
    required("#humidity").textContent = data.humidity.toFixed(1);
    prediction.textContent = data.predictionStatus === "SUCCEEDED" ? data.prediction :
        `Measurement saved — prediction ${data.predictionStatus.toLowerCase()}${data.predictionError ? ` (${data.predictionError})` : ""}`;
    sensorStatus.textContent = `${data.simulated === null ? "Origin unknown" : data.simulated ? "Simulated measurements" : "Sensor measurements"} · ${data.capturedAt ? new Date(data.capturedAt).toLocaleString() : "Legacy time unknown"}`;
}
async function load() {
    try {
        const data = await request("/sensors");
        if (data)
            update(data);
        else
            sensorStatus.textContent = "No measurements yet";
    }
    catch (error) {
        sensorStatus.textContent = error instanceof Error ? error.message : "Unable to load sensors";
    }
}
captureButton.addEventListener("click", () => {
    captureButton.disabled = true;
    buttonText.textContent = "Capturing…";
    void request("/sensors/capture", undefined, true).then(data => { if (data)
        update(data); })
        .catch((error) => { sensorStatus.textContent = error.message; })
        .finally(() => { captureButton.disabled = false; buttonText.textContent = "Capture Data"; });
});
const keys = new KeyboardState();
const control = new MovementControl({
    async acquire() {
        const result = await request("/movement/session", undefined, true);
        if (!result)
            throw new Error("Empty controller response");
        return result;
    },
    async send(body) {
        const ack = await request("/movement", body, true);
        if (!ack || ack.status !== "OK" || ack.sessionId !== body.sessionId || ack.sequence !== body.sequence)
            throw new Error("Invalid device acknowledgement");
        return ack;
    }
}, message => { movementStatus.textContent = message; }, () => keys.clear());
const acquireButton = required("#AcquireControl");
acquireButton.addEventListener("click", () => {
    keys.clear();
    acquireButton.disabled = true;
    void control.acquire().finally(() => { acquireButton.disabled = false; });
});
function stop() { keys.clear(); control.stop(); }
required("#StopMovement").addEventListener("click", stop);
function typing(target) {
    return target instanceof HTMLElement && (target.isContentEditable || !!target.closest("input, textarea, select"));
}
document.addEventListener("keydown", event => {
    if (typing(event.target) || event.repeat || event.ctrlKey || event.metaKey || event.altKey)
        return;
    const key = event.key.toLowerCase();
    if (!["w", "a", "s", "d"].includes(key))
        return;
    event.preventDefault();
    keys.press(key);
    control.set(keys.command());
});
document.addEventListener("keyup", event => {
    const key = event.key.toLowerCase();
    if (!keys.pressedKeys.has(key))
        return;
    keys.release(key);
    control.set(keys.command());
});
window.addEventListener("blur", stop);
window.addEventListener("pagehide", stop);
document.addEventListener("visibilitychange", () => { if (document.hidden)
    stop(); });
document.addEventListener("focusin", event => { if (typing(event.target))
    stop(); });
void load();
