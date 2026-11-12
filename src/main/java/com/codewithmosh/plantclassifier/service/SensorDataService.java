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
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(SensorDataService.class);
    private static <T> T timed(String metric, java.util.function.Supplier<T> action) {
        long start = System.nanoTime();
        try { return action.get(); }
        finally { LOG.debug("metric={} elapsedMs={}", metric, (System.nanoTime()-start)/1_000_000.0); }
    }
    private SensorData save(SensorData data) { return timed("postgres-save", () -> repository.saveAndFlush(data)); }
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
    private static boolean inRange(double value, double min, double max) {
        return Double.isFinite(value) && value >= min && value <= max;
    }
    private static String source(tools.jackson.databind.JsonNode json, String field, String... allowed) {
        if (!json.has(field) || json.get(field).isNull()) return null; // Legacy origin unknown.
        String value = DeviceResponse.text(json, field);
        if (value.equals("software") || java.util.Arrays.asList(allowed).contains(value)) return value;
        throw DeviceResponse.invalid();
    }
    public CaptureResponse captureData() {
        if (!capacity.tryAcquire()) throw new SystemFailure(503, "capture-busy", "Capture capacity is busy");
        try {
            var json = timed("sensor-capture", () -> DeviceResponse.read(client.get().uri("/capture")));
            double ph = DeviceResponse.number(json, "ph");
            double temperature = DeviceResponse.number(json, "temperature");
            double humidity = DeviceResponse.number(json, "humidity");
            boolean simulated = DeviceResponse.bool(json, "simulated");
            if (!inRange(ph, 0, 14) || !inRange(humidity, 0, 100)
                    || !inRange(temperature, minTemperature, maxTemperature)) {
                throw new SystemFailure(502, "sensor-data", "Device returned incomplete or invalid sensor readings");
            }
            long age = json.has("sampleAgeMs") ? DeviceResponse.integer(json, "sampleAgeMs") : 0;
            if (age < 0 || age > 2000) throw new SystemFailure(409, "stale-sample", "Sensor sample is too old; release servo and capture again");
            SensorData data = new SensorData();
            if (json.has("deviceId") || json.has("sampleId")) {
                String deviceId = DeviceResponse.text(json, "deviceId"), sampleId = DeviceResponse.text(json, "sampleId");
                if (!deviceId.matches("[A-Za-z0-9_-]{1,64}") || !sampleId.matches("[A-Za-z0-9_-]{1,80}")) throw DeviceResponse.invalid();
                data.setDeviceId(deviceId); data.setSampleId(sampleId);
                var existing = repository.findByDeviceIdAndSampleId(deviceId, sampleId);
                if (existing.isPresent()) return CaptureResponse.from(existing.get());
            }
            data.setReceivedAt(Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS));
            data.setPh(ph); data.setTemperature(temperature); data.setHumidity(humidity);
            // PostgreSQL timestamps retain microseconds; return the same instant on capture and reload.
            data.setCapturedAt(data.getReceivedAt().minusMillis(age).truncatedTo(java.time.temporal.ChronoUnit.MICROS)); data.setSimulated(simulated);
            data.setTemperatureSource(source(json, "temperatureSource", "dht11"));
            data.setHumiditySource(source(json, "humiditySource", "dht11"));
            data.setPhSource(source(json, "phSource", "potentiometer", "calibrated-ph-probe"));
            if ("potentiometer".equals(data.getPhSource()) || "software".equals(data.getPhSource())
                    || "software".equals(data.getTemperatureSource()) || "software".equals(data.getHumiditySource()))
                data.setSimulated(true);
            if (json.has("soilStatus") && !json.get("soilStatus").isNull()) {
                String status = DeviceResponse.text(json, "soilStatus");
                if (status.length() > 32) throw DeviceResponse.invalid();
                data.setSoilStatus(status);
            }
            data.setSoilMoistureSource(source(json, "soilMoistureSource", "resistive-analog"));
            if (json.has("soilMoisture") && !json.get("soilMoisture").isNull()) {
                double soil = DeviceResponse.number(json, "soilMoisture");
                if (!inRange(soil, 0, 100) || data.getSoilMoistureSource() == null) throw DeviceResponse.invalid();
                data.setSoilMoisture(soil);
            }
            if ("software".equals(data.getSoilMoistureSource())) data.setSimulated(true);
            data.setPredictionStatus("PENDING");
            data.setPredictionError("ml-not-completed");
            boolean soilUnavailable = data.getSoilMoisture() == null || (data.getSoilStatus() != null && !"calibrated".equals(data.getSoilStatus()));
            if (soilUnavailable) data.setPredictionError("soil-" + (data.getSoilStatus() == null ? "unavailable" : data.getSoilStatus()));
            // This commit is independent of prediction. Do not wrap this method in a database transaction.
            try { data = save(data); }
            catch (org.springframework.dao.DataIntegrityViolationException duplicate) {
                // The database unique index arbitrates concurrent captures across backend instances.
                if (data.getSampleId() != null) {
                    var existing = repository.findByDeviceIdAndSampleId(data.getDeviceId(), data.getSampleId());
                    if (existing.isPresent()) return CaptureResponse.from(existing.get());
                }
                throw duplicate;
            }
            if (soilUnavailable) {
                return CaptureResponse.from(data); // Explicit diagnostic; never impute.
            }
            data.setPredictionModel("synthetic-five-crops-v2");
            try {
                SensorData measurement = data;
                data.setPrediction(timed("ml", () -> ml.predict(measurement.getTemperature(), measurement.getHumidity(), measurement.getPh(), measurement.getSoilMoisture())));
                data.setPredictionStatus("SUCCEEDED");
                data.setPredictionError(null);
            } catch (SystemFailure ex) {
                data.setPredictionStatus("ml-out-of-domain".equals(ex.category()) ? "OUT_OF_DOMAIN" : "FAILED");
                data.setPredictionError(ex.category());
            }
            // If this write fails, the first persisted measurement remains PENDING for troubleshooting.
            return CaptureResponse.from(save(data));
        } finally { capacity.release(); }
    }
}
