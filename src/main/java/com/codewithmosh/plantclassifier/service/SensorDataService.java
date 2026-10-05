package com.codewithmosh.plantclassifier.service;

import com.codewithmosh.plantclassifier.model.SensorData;
import com.codewithmosh.plantclassifier.repository.SensorDataRepository;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@Service
public class SensorDataService {

    private final SensorDataRepository sensorDataRepository;
    private final MLService mlService;

    @Value("${esp32.url}")
    private String esp32Url;


    public SensorDataService(
            SensorDataRepository sensorDataRepository,
            MLService mlService
    ) {
        this.sensorDataRepository = sensorDataRepository;
        this.mlService = mlService;
    }


    public SensorData saveSensorData(SensorData data) {
        return sensorDataRepository.save(data);
    }


    public SensorData getLatestSensorData() {

        List<SensorData> data = sensorDataRepository.findAll();

        if (data.isEmpty()) {
            return null;
        }

        return data.get(data.size() - 1);
    }


    public Map<String, Object> captureData() throws IOException, InterruptedException {

        // Connection with the ESP32 server
        RestClient restClient = RestClient.create();

        // Get sensor data from ESP32
        SensorData data = restClient.get()
                .uri(esp32Url + "/capture")
                .retrieve()
                .body(SensorData.class);

        // Save sensor data in PostgreSQL
        saveSensorData(data);

        // Send sensor data to the ML model
        String prediction = mlService.predict(
                data.getTemperature(),
                data.getHumidity(),
                data.getPh()
        );

        // Return sensor data + prediction
        return Map.of(
                "ph", data.getPh(),
                "temperature", data.getTemperature(),
                "humidity", data.getHumidity(),
                "prediction", prediction
        );
    }
}
