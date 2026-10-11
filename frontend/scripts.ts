/* =====================================
    INTERFACES
===================================== */

interface SensorData {
    ph: number;
    temperature: number;
    humidity: number;
}

interface CaptureResponse extends SensorData {
    prediction: string;
}

/* =====================================
    DOM SELECTORS
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

/* =====================================
    UPDATE DOM
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
            throw new Error(`HTTP error: ${response.status}`);
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
            throw new Error(`HTTP error: ${response.status}`);
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
    INITIALIZATION & EVENT LISTENERS
===================================== */

void loadSensorData();

captureButton.addEventListener("click", () => {
    void captureSensorData();
});
