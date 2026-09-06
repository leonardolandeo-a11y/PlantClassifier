package com.codewithmosh.plantclassifier.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name ="SensorData")
public class SensorData {
    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE)
    private Long id;

    private double ph;
    private double temperature;
    private double humidity;

    public SensorData(double ph, double temperature, double humidity) {
        this.ph = ph;
        this.temperature = temperature;
        this.humidity = humidity;
    }

    public SensorData(){

    }


}
