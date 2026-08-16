package com.codewithmosh.plantclassifier.model;

public class SensorData {
    private double ph;
    private double temperature;
    private double humidity;

    public double getPh(){
        return ph;
    }
    public double getTemperature(){
        return temperature;
    }
    public double getHumidity(){
        return humidity;
    }

    public void setPh(double ph){
        this.ph = ph;
    }
    public void setTemperature(double temperature){
        this.temperature = temperature;
    }
    public void setHumidity(double humidity){
        this.humidity = humidity;
    }

}
