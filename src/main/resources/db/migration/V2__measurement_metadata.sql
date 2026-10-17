-- Do not fabricate historical reception timestamps or simulation provenance.
ALTER TABLE sensor_data ADD COLUMN captured_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE sensor_data ADD COLUMN simulated BOOLEAN;
ALTER TABLE sensor_data ADD COLUMN prediction VARCHAR(255);
ALTER TABLE sensor_data ADD COLUMN prediction_status VARCHAR(255) DEFAULT 'NOT_REQUESTED' NOT NULL;
ALTER TABLE sensor_data ADD COLUMN prediction_error VARCHAR(255);
