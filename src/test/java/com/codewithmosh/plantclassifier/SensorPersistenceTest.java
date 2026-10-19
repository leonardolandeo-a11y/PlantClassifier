package com.codewithmosh.plantclassifier;

import com.codewithmosh.plantclassifier.model.SensorData;
import com.codewithmosh.plantclassifier.repository.SensorDataRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest @ActiveProfiles("test") @Transactional
class SensorPersistenceTest {
    @Autowired SensorDataRepository repository;
    @Test void persistsTimestampAndReturnsLatestByExplicitIdOrdering() {
        for(int i=0;i<3;i++) {
            SensorData row=new SensorData();
            row.setPh(7); row.setTemperature(20+i); row.setHumidity(60);
            row.setCapturedAt(Instant.parse("2026-01-01T00:00:00Z"));
            row.setTemperatureSource("dht11"); row.setHumiditySource("dht11"); row.setPhSource("potentiometer");
            row.setSimulated(true); row.setPredictionStatus("PENDING"); repository.saveAndFlush(row);
        }
        var result=repository.findTopByOrderByIdDesc().orElseThrow();
        assertEquals("potentiometer",result.getPhSource()); assertEquals("dht11",result.getTemperatureSource());
        assertEquals(22,result.getTemperature()); assertEquals(Instant.parse("2026-01-01T00:00:00Z"),result.getCapturedAt());
    }
}
