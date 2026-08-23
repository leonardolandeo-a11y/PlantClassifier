package com.codewithmosh.plantclassifier.controlller;


import com.codewithmosh.plantclassifier.model.SensorData;
import com.codewithmosh.plantclassifier.service.SensorDataService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;


@RestController
@RequestMapping("/sensors")
public class SensorDataController {
    private final SensorDataService sensorDataService;

    @Autowired
    SensorDataController(SensorDataService sensorDataService){
        this.sensorDataService = sensorDataService;
    }

    @GetMapping
    public SensorData getSensorData(){
        return sensorDataService.getLatestSensorData();
    }

    @PostMapping("/capture")
    public SensorData captureData() {

        RestClient restClient = RestClient.create();

        SensorData data = restClient.get()
                .uri("http://192.168.100.17/capture")
                .retrieve()
                .body(SensorData.class);

        return sensorDataService.saveSensorData(data);
    }
}


