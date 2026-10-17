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
    // Backend reception time in UTC. Null means a legacy measurement with unknown capture time.
    private Instant capturedAt;
    private Boolean simulated;
    private String prediction;
    @Column(nullable = false) private String predictionStatus;
    private String predictionError;
}
