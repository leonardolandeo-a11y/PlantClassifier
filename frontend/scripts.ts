
/* =====================================
   INTERFACES AND TYPES
   ===================================== */

interface SensorData {
    ph: number;
    temperature: number;
    humidity: number;
}

interface CaptureResponse extends SensorData {
    prediction: string;
}

type MovementDirection =
    | "FORWARD"
    | "BACKWARD"
    | "LEFT"
    | "RIGHT";

type MovementCommand = MovementDirection | "STOP";

interface MovementRequest {
    command: MovementCommand;
    speed: number;
}

/* =====================================
   DOM ELEMENTS
   ===================================== */

function required<T extends Element>(selector: string): T {
    const element = document.querySelector<T>(selector);

    if (!element) {
        throw new Error(`Element not found: ${selector}`);
    }

    return element;
}

const ph = required<HTMLSpanElement>("#ph");
const temperature = required<HTMLSpanElement>("#temperature");
const humidity = required<HTMLSpanElement>("#humidity");
const prediction = required<HTMLParagraphElement>("#prediction");

const captureButton = required<HTMLButtonElement>("#CaptureData");
const buttonText = required<HTMLSpanElement>("#buttonText");

// Optional because this element may not exist in the HTML yet
const movementStatus = document.querySelector<HTMLElement>("#movementStatus");

/* =====================================
   UPDATE SENSOR DATA
   ===================================== */

function updateSensorData(data: SensorData): void {
    ph.textContent = String(data.ph);
    temperature.textContent = String(data.temperature);
    humidity.textContent = String(data.humidity);
}

function updateSensorDataResult(data: CaptureResponse): void {
    updateSensorData(data);
    prediction.textContent = data.prediction;
}

/* =====================================
   GET — LOAD LATEST SENSOR DATA
   ===================================== */

async function loadSensorData(): Promise<void> {
    try {
        const response = await fetch("/sensors");

        if (!response.ok) {
            throw new Error(`Sensor request failed: ${response.status}`);
        }

        const data: SensorData = await response.json();

        updateSensorData(data);

    } catch (error) {
        console.error("Error loading sensor data:", error);
    }
}

/* =====================================
   POST — CAPTURE SENSOR DATA
   ===================================== */

async function captureSensorData(): Promise<void> {
    captureButton.disabled = true;
    buttonText.textContent = "Capturing...";

    try {
        const response = await fetch("/sensors/capture", {
            method: "POST"
        });

        if (!response.ok) {
            throw new Error(`Capture request failed: ${response.status}`);
        }

        const data: CaptureResponse = await response.json();

        console.log("Captured data:", data);

        updateSensorDataResult(data);

    } catch (error) {
        console.error("Error capturing sensor data:", error);

    } finally {
        captureButton.disabled = false;
        buttonText.textContent = "Capture Data";
    }
}

/* =====================================
   ROBOT MOVEMENT CONFIGURATION
   ===================================== */

const MOVEMENT_SPEED: number = 150;

const COMMAND_INTERVAL: number = 500;

let currentCommand: MovementCommand = "STOP";

let movementInterval: ReturnType<typeof setInterval> | null = null;

/* =====================================
   POST — SEND MOVEMENT COMMAND
   ===================================== */

async function sendMovementCommand(
    command: MovementCommand
): Promise<void> {

    const request: MovementRequest = {
        command,
        speed: MOVEMENT_SPEED
    };

    try {
        const response = await fetch("/movement", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(request)
        });

        if (!response.ok) {
            throw new Error(
                `Movement request failed: ${response.status}`
            );
        }

        if (movementStatus) {
            movementStatus.textContent = command;
        }

        console.log(`Movement command sent: ${command}`);

    } catch (error) {
        console.error("Movement error:", error);
    }
}

/* =====================================
   START MOVEMENT
   ===================================== */

function startMovement(command: MovementDirection): void {

    if (currentCommand === command) {
        return;
    }

    // Clear any previous movement interval
    if (movementInterval !== null) {
        clearInterval(movementInterval);
    }

    currentCommand = command;

    // Send command immediately
    void sendMovementCommand(command);

    // Repeat while the key remains pressed
    movementInterval = setInterval(() => {
        void sendMovementCommand(command);
    }, COMMAND_INTERVAL);
}

/* =====================================
   STOP MOVEMENT
   ===================================== */

function stopMovement(): void {

    if (currentCommand === "STOP") {
        return;
    }

    if (movementInterval !== null) {
        clearInterval(movementInterval);
        movementInterval = null;
    }

    currentCommand = "STOP";

    void sendMovementCommand("STOP");
}

/* =====================================
   KEYBOARD CONTROL

   W = Forward
   S = Backward
   A = Left
   D = Right
   ===================================== */

document.addEventListener("keydown", (event: KeyboardEvent): void => {

    // Ignore repeated keyboard events
    if (event.repeat) {
        return;
    }

    const key: string = event.key.toLowerCase();

    switch (key) {

        case "w":
            startMovement("FORWARD");
            break;

        case "s":
            startMovement("BACKWARD");
            break;

        case "a":
            startMovement("LEFT");
            break;

        case "d":
            startMovement("RIGHT");
            break;
    }
});

/* =====================================
   STOP WHEN KEY IS RELEASED
   ===================================== */

document.addEventListener("keyup", (event: KeyboardEvent): void => {

    const key: string = event.key.toLowerCase();

    if (key === "w" || key === "a" || key === "s" || key === "d") {
        stopMovement();
    }
});

/* =====================================
   STOP WHEN WINDOW LOSES FOCUS
   ===================================== */

window.addEventListener("blur", (): void => {
    stopMovement();
});

/* =====================================
   INITIALIZATION
   ===================================== */

// Load sensor data when the page opens
void loadSensorData();

// Capture sensor data when the button is clicked
captureButton.addEventListener("click", (): void => {
    void captureSensorData();
});
