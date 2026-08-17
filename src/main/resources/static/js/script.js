fetch("/sensors")
    .then(response => response.json())
    .then(data => {
        document.getElementById("ph").textContent = data.ph;
        document.getElementById("temperature").textContent = data.temperature;
        document.getElementById("humidity").textContent = data.humidity;
    });