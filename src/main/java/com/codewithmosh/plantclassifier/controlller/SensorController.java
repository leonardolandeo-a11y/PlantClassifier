package com.codewithmosh.plantclassifier.controlller;


import com.codewithmosh.plantclassifier.model.SensorData;
import org.springframework.web.bind.annotation.*;

import javax.xml.crypto.Data;
import java.util.zip.DataFormatException;

@RestController
@RequestMapping("/sensors")
public class SensorController {
    private SensorData Data_ESP32;
    @PostMapping
    public String receiveSensorData(@RequestBody SensorData data){
        Data_ESP32 = data;
        System.out.println("pH: "+ data.getPh());
        System.out.println("Temperature: "+ data.getTemperature());
        System.out.println("Humidity: " + data.getHumidity());
        return "Sensor data received";
    }
    @GetMapping
    public  SensorData getSensorData(){
        return Data_ESP32;
    }
}


