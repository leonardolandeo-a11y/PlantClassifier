package com.codewithmosh.plantclassifier.service;

import com.codewithmosh.plantclassifier.dto.*;
import com.codewithmosh.plantclassifier.model.SensorData;
import com.codewithmosh.plantclassifier.repository.SensorDataRepository;
import com.codewithmosh.plantclassifier.exception.SystemFailure;
import org.springframework.beans.factory.annotation.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.Semaphore;

@Service
public class SensorDataService {
    private final SensorDataRepository repository;
    private final MLService ml;
    private final RestClient client;
    private final double minTemperature;
    private final double maxTemperature;
    private final Semaphore capacity = new Semaphore(2);

    public SensorDataService(SensorDataRepository repository, MLService ml,
                             @Qualifier("sensorClient") RestClient client,
                             @Value("${sensor.temperature-min}") double minTemperature,
                             @Value("${sensor.temperature-max}") double maxTemperature) {
        if (!Double.isFinite(minTemperature) || !Double.isFinite(maxTemperature) || minTemperature > maxTemperature)
            throw new IllegalArgumentException("Invalid temperature range");
        this.repository = repository; this.ml = ml; this.client = client;
        this.minTemperature = minTemperature; this.maxTemperature = maxTemperature;
    }
    public Optional<CaptureResponse> getLatestSensorData() {
        return repository.findTopByOrderByIdDesc().map(CaptureResponse::from);
    }
    private static boolean inRange(Double value, double min, double max) {
        return value != null && Double.isFinite(value) && value >= min && value <= max;
    }
    public CaptureResponse captureData() {
        if (!capacity.tryAcquire()) throw new SystemFailure(503, "capture-busy", "Capture capacity is busy");
        try {
            var json = DeviceResponse.read(client.get().uri("/capture"));
            SensorReading reading = new SensorReading(DeviceResponse.number(json, "ph"),
                    DeviceResponse.number(json, "temperature"), DeviceResponse.number(json, "humidity"),
                    DeviceResponse.bool(json, "simulated"));
            if (reading == null || !inRange(reading.ph(), 0, 14) || !inRange(reading.humidity(), 0, 100)
                    || !inRange(reading.temperature(), minTemperature, maxTemperature) || reading.simulated() == null) {
                throw new SystemFailure(502, "sensor-data", "Device returned incomplete or invalid sensor readings");
            }
            SensorData data = new SensorData();
            data.setPh(reading.ph()); data.setTemperature(reading.temperature()); data.setHumidity(reading.humidity());
            data.setCapturedAt(Instant.now()); data.setSimulated(reading.simulated());
            data.setPredictionStatus("PENDING");
            // This commit is independent of prediction. Do not wrap this method in a database transaction.
            data = repository.saveAndFlush(data);
            try {
                data.setPrediction(ml.predict(data.getTemperature(), data.getHumidity(), data.getPh()));
                data.setPredictionStatus("SUCCEEDED");
            } catch (SystemFailure ex) {
                data.setPredictionStatus("FAILED");
                data.setPredictionError(ex.category());
            }
            // If this write fails, the first persisted measurement remains PENDING for troubleshooting.
            return CaptureResponse.from(repository.saveAndFlush(data));
        } finally { capacity.release(); }
    }
}
