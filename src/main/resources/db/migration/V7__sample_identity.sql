-- Additive: legacy captures retain unknown identity and reception time.
ALTER TABLE sensor_data ADD COLUMN device_id VARCHAR(64);
ALTER TABLE sensor_data ADD COLUMN sample_id VARCHAR(80);
ALTER TABLE sensor_data ADD COLUMN received_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE sensor_data ADD CONSTRAINT sensor_sample_identity_pair
    CHECK ((device_id IS NULL) = (sample_id IS NULL));
CREATE UNIQUE INDEX sensor_sample_identity ON sensor_data(device_id, sample_id);
