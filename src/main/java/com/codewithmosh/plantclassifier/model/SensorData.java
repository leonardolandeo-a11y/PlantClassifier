package com.codewithmosh.plantclassifier.model;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter @Setter @Entity @Table(name = "sensor_data") @NoArgsConstructor
public class SensorData {
    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "sensor_sequence")
    @SequenceGenerator(name = "sensor_sequence", sequenceName = "sensor_data_seq", allocationSize = 50)
    private Long id;
    @Column(nullable = false) private double ph;
    @Column(nullable = false) private double temperature;
    @Column(nullable = false) private double humidity;
    // Estimated acquisition time: backend receipt minus device sample age. Not a synchronized device clock.
    private Instant capturedAt;
    private Instant receivedAt;
    @Column(length = 64) private String deviceId;
    @Column(length = 80) private String sampleId;
    private Boolean simulated;
    private String temperatureSource;
    private String humiditySource;
    private String phSource;
    @Column(length = 32) private String soilStatus;
    private Double soilMoisture;
    private String soilMoistureSource;
    private String predictionModel;
    private String prediction;
    @Column(nullable = false) private String predictionStatus;
    private String predictionError;
}
