ALTER TABLE sensor_data ADD COLUMN soil_moisture DOUBLE PRECISION CHECK (soil_moisture BETWEEN 0 AND 100);
ALTER TABLE sensor_data ADD COLUMN soil_moisture_source VARCHAR(255);
