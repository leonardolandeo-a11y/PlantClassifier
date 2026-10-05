package com.codewithmosh.plantclassifier.controller;

import com.codewithmosh.plantclassifier.model.SensorData;
import com.codewithmosh.plantclassifier.service.SensorDataService;

import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.util.Map;

@RestController
@RequestMapping("/sensors")
public class SensorDataController {

    private final SensorDataService sensorDataService;

    public SensorDataController(
            SensorDataService sensorDataService
    ) {
        this.sensorDataService = sensorDataService;
    }


    @GetMapping
    public SensorData getSensorData() {
        return sensorDataService.getLatestSensorData();
    }


    @PostMapping("/capture")
    public Map<String, Object> captureData()
            throws IOException, InterruptedException {

        return sensorDataService.captureData();
    }
}