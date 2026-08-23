package com.codewithmosh.plantclassifier.service;

import com.codewithmosh.plantclassifier.model.SensorData;
import com.codewithmosh.plantclassifier.repository.SensorDataRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class SensorDataService {
    private final SensorDataRepository sensorDataRepository;

    @Autowired
    SensorDataService(SensorDataRepository sensorDataRepository){
        this.sensorDataRepository = sensorDataRepository;
    }

    public SensorData saveSensorData(SensorData data){
        return sensorDataRepository.save(data);
    }

    public SensorData getLatestSensorData(){
        List<SensorData> data = sensorDataRepository.findAll();
        if (data.isEmpty()){
            return null;
        }
        return data.get(data.size()-1);

    }

}
