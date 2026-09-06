const ph = document.getElementById("ph");
const temperature = document.getElementById("temperature");
const humidity = document.getElementById("humidity");
const captureButton = document.getElementById("CaptureData");
const buttonText = document.getElementById("buttonText");
const prediction= document.getElementById("prediction")
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
