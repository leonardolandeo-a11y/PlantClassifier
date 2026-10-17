package com.codewithmosh.plantclassifier.dto;

import java.time.Instant;
import com.codewithmosh.plantclassifier.model.SensorData;

public record CaptureResponse(Long id, double ph, double temperature, double humidity, Instant capturedAt,
                              Boolean simulated, String prediction, String predictionStatus, String predictionError) {
    public static CaptureResponse from(SensorData data) {
        return new CaptureResponse(data.getId(), data.getPh(), data.getTemperature(), data.getHumidity(),
                data.getCapturedAt(), data.getSimulated(), data.getPrediction(),
                data.getPredictionStatus(), data.getPredictionError());
    }
}
