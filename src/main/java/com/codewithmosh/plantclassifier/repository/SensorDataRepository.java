package com.codewithmosh.plantclassifier.repository;

import com.codewithmosh.plantclassifier.model.SensorData;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SensorDataRepository extends JpaRepository<SensorData,Long> {


}
