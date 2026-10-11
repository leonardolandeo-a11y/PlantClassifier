"use strict";
/* =====================================
    INTERFACES
===================================== */
/* =====================================
    DOM SELECTORS
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
/* =====================================
    UPDATE DOM
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
            throw new Error(`HTTP error: ${response.status}`);
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
            throw new Error(`HTTP error: ${response.status}`);
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
    INITIALIZATION & EVENT LISTENERS
===================================== */
void loadSensorData();
captureButton.addEventListener("click", () => {
    void captureSensorData();
});
