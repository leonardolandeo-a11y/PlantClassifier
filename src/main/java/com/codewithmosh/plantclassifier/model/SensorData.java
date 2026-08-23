package com.codewithmosh.plantclassifier.model;

import jakarta.persistence.*;

@Entity
@Table(name ="SensorData")
public class SensorData {
    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE)
    private Long id;

    private double ph;
    private double temperature;
    private double humidity;

    public SensorData(){

    }

    public double getPh() {
        return ph;
    }

    public void setPh(double ph) {
        this.ph = ph;
    }

    public double getTemperature() {
        return temperature;
    }

    public void setTemperature(double temperature) {
        this.temperature = temperature;
    }

    public double getHumidity() {
        return humidity;
    }

    public void setHumidity(double humidity) {
        this.humidity = humidity;
    }
}
