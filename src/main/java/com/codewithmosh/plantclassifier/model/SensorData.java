package com.codewithmosh.plantclassifier.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name ="SensorData")
@NoArgsConstructor
@AllArgsConstructor
public class SensorData {
    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE)
    private Long id;
    @Column(nullable = false)
    private double ph;
    @Column(nullable = false)
    private double temperature;
    @Column(nullable = false)
    private double humidity;


}
