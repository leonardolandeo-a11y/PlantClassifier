const ph = document.getElementById("ph");
const temperature = document.getElementById("temperature");
const humidity = document.getElementById("humidity");
const captureButton = document.getElementById("CaptureData");
const buttonText = document.getElementById("buttonText");
const prediction= document.getElementById("prediction")

const movementStatus = document.getElementById("movementStatus");

// Update the sensor values on the page
function updateSensorData(data) {
    ph.textContent = data.ph;
    temperature.textContent = data.temperature;
    humidity.textContent = data.humidity;
}
function updateSensorData_Result(data) {
    ph.textContent = data.ph;
    temperature.textContent = data.temperature;
    humidity.textContent = data.humidity;
    prediction.textContent = data.prediction;
}

// Load the latest sensor data when the page opens
fetch("/sensors")
    .then(response => response.json())
    .then(data => {
        updateSensorData(data);
    })
    .catch(error => {
        console.error("Error loading sensor data:", error);
    });

// Capture new data from the ESP32
captureButton.addEventListener("click", () => {


captureButton.disabled = true;
buttonText.textContent = "Capturing...";

fetch("/sensors/capture", {
    method: "POST"
})
    .then(response => response.json())
    .then(data => {
        console.log("Captured data:", data);
        updateSensorData_Result(data);
    })
    .catch(error => {
        console.error("Error capturing sensor data:", error);
    })
    .finally(() => {
        captureButton.disabled = false;
        buttonText.textContent = "Capture Data";
    });


});


// ============================================================
// ROBOT MOVEMENT CONFIGURATION
// ============================================================

const MOVEMENT_SPEED = 150;

const COMMAND_INTERVAL = 500;

let currentCommand = "STOP";

let movementInterval = null;


// ============================================================
// SEND MOVEMENT COMMAND TO SPRING
// ============================================================

function sendMovementCommand(command) {

    fetch("/movement", {

        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            command: command,
            speed: MOVEMENT_SPEED
        })

    })
        .then(response => {

            if (!response.ok) {

                throw new Error(`Movement request failed: ${response.status}`);
            }

            movementStatus.textContent = command;

            console.log(`Movement command sent: ${command}`);
        })
        .catch(error => {
            console.error("Movement error:", error);
        });
}


// ============================================================
// START MOVEMENT
// ============================================================

function startMovement(command) {

    if (currentCommand === command) {
        return;
    }

    // Stop any previous command interval
    clearInterval(movementInterval);

    currentCommand = command;

    // Send immediately
    sendMovementCommand(command);

    // Keep sending while key is being held
    movementInterval = setInterval(() => {sendMovementCommand(command);}, COMMAND_INTERVAL);
}


// ============================================================
// STOP MOVEMENT
// ============================================================

function stopMovement() {

    if (currentCommand === "STOP") {
        return;
    }

    clearInterval(movementInterval);

    movementInterval = null;

    currentCommand = "STOP";

    sendMovementCommand("STOP");
}


// ============================================================
// KEYBOARD CONTROL
//
// W = Forward
// S = Backward
// A = Left
// D = Right
// ============================================================

document.addEventListener("keydown", event => {

    // Prevent browser key-repeat from creating multiple intervals
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


// ============================================================
// STOP WHEN KEY IS RELEASED
// ============================================================

document.addEventListener("keyup", event => {

    const key = event.key.toLowerCase();

    if (key === "w" || key === "a" || key === "s" || key === "d") {
        stopMovement();
    }
});


// ============================================================
// SAFETY: STOP IF USER LEAVES THE TAB
// ============================================================

window.addEventListener("blur", () => {

    stopMovement();
});

