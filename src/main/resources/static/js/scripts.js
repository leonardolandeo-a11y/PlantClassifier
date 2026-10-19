import { KeyboardState, MovementControl, ControlRejected } from "./control.js";
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
let signedIn = false;
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
        if (response.status === 401) {
            setAuthentication(false);
            csrf = undefined;
            throw new Error("Sign in to control the robot or capture sensors");
        }
        if (response.status === 403) {
            csrf = undefined;
            throw new Error("Session protection expired; reload the page");
        }
        if (response.status === 409)
            throw new ControlRejected("Command rejected: control expired or superseded");
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
        .finally(() => { captureButton.disabled = !signedIn; buttonText.textContent = "Capture Data"; });
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
function stop() { keys.clear(); control.stop(); }
required("#StopMovement").addEventListener("click", stop);
function typing(target) {
    return target instanceof HTMLElement && (target.isContentEditable || !!target.closest("input, textarea, select"));
}
document.addEventListener("keydown", event => {
    if (!signedIn || document.hidden || !document.hasFocus() || typing(event.target) || event.repeat || event.ctrlKey || event.metaKey || event.altKey)
        return;
    const key = event.key.toLowerCase();
    if (!["w", "a", "s", "d"].includes(key))
        return;
    if (keys.pressedKeys.has(key))
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
function setAuthentication(authenticated, username = "") {
    signedIn = authenticated;
    required("#authStatus").textContent = authenticated ? `Signed in as ${username}` : "Sign in to use the controls";
    required("#SignIn").hidden = authenticated;
    required("#SignOut").hidden = !authenticated;
    captureButton.disabled = !authenticated;
    if (!authenticated)
        stop();
    else
        movementStatus.textContent = "Ready for keyboard control — press W/A/S/D";
}
required("#SignOut").addEventListener("click", () => {
    stop();
    void (async () => {
        // Native form navigation follows Spring's logout redirect and clears cached page state.
        const response = await fetch("/csrf", { cache: "no-store" });
        if (!response.ok)
            throw new Error("Unable to initialize sign out");
        const token = await response.json();
        const form = document.createElement("form");
        form.method = "post";
        form.action = "/logout";
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "_csrf";
        input.value = token.token;
        form.append(input);
        document.body.append(form);
        form.submit();
    })().catch((error) => { movementStatus.textContent = error.message; });
});
setAuthentication(false);
void request("/session").then(session => {
    setAuthentication(session?.authenticated ?? false, session?.username);
    if (session?.authenticated)
        void load();
}).catch((error) => { sensorStatus.textContent = error.message; });
