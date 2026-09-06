package com.codewithmosh.plantclassifier.controlller;


import com.codewithmosh.plantclassifier.model.SensorData;
import com.codewithmosh.plantclassifier.service.MLService;
import com.codewithmosh.plantclassifier.service.SensorDataService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.util.Map;


@RestController
@RequestMapping("/sensors")
public class SensorDataController {
    private final SensorDataService sensorDataService;
    private final MLService mlService;
    @Autowired
    SensorDataController(SensorDataService sensorDataService, MLService mlService){
        this.sensorDataService = sensorDataService;
        this.mlService = mlService;
    }

    @GetMapping
    public SensorData getSensorData(){
        return sensorDataService.getLatestSensorData();
    }

    @PostMapping("/capture")
    public Map<String, Object> captureData() throws IOException, InterruptedException{
        // Connection with the server of the ESP32
        RestClient restClient = RestClient.create();

        // get() -> Method
        // retieve() -> Get the response of the ESP32'servers
        // body(SensorData.class) -> take the response body and convert it into a SensorData object
        SensorData data = restClient.get()
                .uri("http://192.168.100.17/capture")
                .retrieve()
                .body(SensorData.class);
        // Save data in the DB
        sensorDataService.saveSensorData(data);

        // Send the data to the ML model
        String prediction = mlService.predict(data.getTemperature(), data.getHumidity(),data.getPh());
        Map<String, Object> result = Map.of("ph", data.getPh(), "temperature",data.getTemperature(), "humidity",data.getHumidity(),"prediction", prediction);
        return result;

    }
}


