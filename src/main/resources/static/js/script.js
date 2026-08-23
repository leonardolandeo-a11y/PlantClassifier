fetch("/sensors")
    .then(response => response.json())
    .then(data => {
        document.getElementById("ph").textContent = data.ph;
        document.getElementById("temperature").textContent = data.temperature;
        document.getElementById("humidity").textContent = data.humidity;
    });


document.getElementById("CaptureData").addEventListener("click", () => {

    fetch("/sensors/capture", {
        method: "POST"
    })
        .then(response => response.json())
        .then(data => {

            console.log("Captured data:", data);

            document.getElementById("ph").textContent = data.ph;
            document.getElementById("temperature").textContent = data.temperature;
            document.getElementById("humidity").textContent = data.humidity;

        })
        .catch(error => {
            console.error("Error:", error);
        });

});