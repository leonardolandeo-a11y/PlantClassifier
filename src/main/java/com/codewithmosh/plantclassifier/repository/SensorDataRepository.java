package com.codewithmosh.plantclassifier.repository;

import com.codewithmosh.plantclassifier.model.SensorData;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface SensorDataRepository extends JpaRepository<SensorData, Long> {
    Optional<SensorData> findByDeviceIdAndSampleId(String deviceId, String sampleId);
    Optional<SensorData> findTopByOrderByIdDesc();
}
