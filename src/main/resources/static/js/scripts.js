"use strict";
/* =====================================
   INTERFACES AND TYPES
   ===================================== */
/* =====================================
   DOM ELEMENTS
   ===================================== */
function required(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        throw new Error(`Element not found: ${selector}`);
    }
    return element;
}
const ph = required("#ph");
const temperature = required("#temperature");
const humidity = required("#humidity");
const prediction = required("#prediction");
const captureButton = required("#CaptureData");
const buttonText = required("#buttonText");
// Optional because this element may not exist in the HTML yet
const movementStatus = document.querySelector("#movementStatus");
/* =====================================
   UPDATE SENSOR DATA
   ===================================== */
function updateSensorData(data) {
    ph.textContent = String(data.ph);
    temperature.textContent = String(data.temperature);
    humidity.textContent = String(data.humidity);
}
function updateSensorDataResult(data) {
    updateSensorData(data);
    prediction.textContent = data.prediction;
}
/* =====================================
   GET — LOAD LATEST SENSOR DATA
   ===================================== */
async function loadSensorData() {
    try {
        const response = await fetch("/sensors");
        if (!response.ok) {
            throw new Error(`Sensor request failed: ${response.status}`);
        }
        const data = await response.json();
        updateSensorData(data);
    }
    catch (error) {
        console.error("Error loading sensor data:", error);
    }
}
/* =====================================
   POST — CAPTURE SENSOR DATA
   ===================================== */
async function captureSensorData() {
    captureButton.disabled = true;
    buttonText.textContent = "Capturing...";
    try {
        const response = await fetch("/sensors/capture", {
            method: "POST"
        });
        if (!response.ok) {
            throw new Error(`Capture request failed: ${response.status}`);
        }
        const data = await response.json();
        console.log("Captured data:", data);
        updateSensorDataResult(data);
    }
    catch (error) {
        console.error("Error capturing sensor data:", error);
    }
    finally {
        captureButton.disabled = false;
        buttonText.textContent = "Capture Data";
    }
}
/* =====================================
   ROBOT MOVEMENT CONFIGURATION
   ===================================== */
const MOVEMENT_SPEED = 150;
const COMMAND_INTERVAL = 500;
let currentCommand = "STOP";
let movementInterval = null;
/* =====================================
   POST — SEND MOVEMENT COMMAND
   ===================================== */
async function sendMovementCommand(command) {
    const request = {
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
            throw new Error(`Movement request failed: ${response.status}`);
        }
        if (movementStatus) {
            movementStatus.textContent = command;
        }
        console.log(`Movement command sent: ${command}`);
    }
    catch (error) {
        console.error("Movement error:", error);
    }
}
/* =====================================
   START MOVEMENT
   ===================================== */
function startMovement(command) {
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
function stopMovement() {
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
document.addEventListener("keydown", (event) => {
    // Ignore repeated keyboard events
    if (event.repeat) {
        return;
    }
    const key = event.key.toLowerCase();
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
document.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "w" || key === "a" || key === "s" || key === "d") {
        stopMovement();
    }
});
/* =====================================
   STOP WHEN WINDOW LOSES FOCUS
   ===================================== */
window.addEventListener("blur", () => {
    stopMovement();
});
/* =====================================
   INITIALIZATION
   ===================================== */
// Load sensor data when the page opens
void loadSensorData();
// Capture sensor data when the button is clicked
captureButton.addEventListener("click", () => {
    void captureSensorData();
});
