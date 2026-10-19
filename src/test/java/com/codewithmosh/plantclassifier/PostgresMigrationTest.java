package com.codewithmosh.plantclassifier;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.sql.*;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="PLANT_TEST_DB_URL", matches=".+")
class PostgresMigrationTest {
    String url=System.getenv("PLANT_TEST_DB_URL");
    String user=System.getenv("PLANT_TEST_DB_USER");
    String password=System.getenv("PLANT_TEST_DB_PASSWORD");
    Flyway flyway(String schema) {
        return Flyway.configure().dataSource(url,user,password).schemas(schema)
                .locations("classpath:db/migration").baselineVersion("1").load();
    }
    @Test void initializesFreshPostgresDatabase() throws Exception {
        String schema="test_"+UUID.randomUUID().toString().replace("-","");
        var result=flyway(schema).migrate(); assertEquals(3,result.migrationsExecuted);
        try(var connection=DriverManager.getConnection(url,user,password);var statement=connection.createStatement()) {
            statement.execute("SET search_path TO "+schema);
            statement.execute("INSERT INTO sensor_data(id,ph,temperature,humidity,captured_at,simulated,prediction_status) VALUES(nextval('sensor_data_seq'),7,20,60,CURRENT_TIMESTAMP,true,'PENDING')");
            try(var rows=statement.executeQuery("SELECT count(*) FROM sensor_data")) { rows.next(); assertEquals(1,rows.getInt(1)); }
        }
    }
    @Test void explicitBaselinePreservesExistingDataAndSequence() throws Exception {
        String schema="legacy_"+UUID.randomUUID().toString().replace("-","");
        try(var connection=DriverManager.getConnection(url,user,password);var statement=connection.createStatement()) {
            statement.execute("CREATE SCHEMA "+schema); statement.execute("SET search_path TO "+schema);
            statement.execute("CREATE SEQUENCE sensor_data_seq START WITH 1001 INCREMENT BY 50");
            statement.execute("CREATE TABLE sensor_data(id BIGINT PRIMARY KEY,ph DOUBLE PRECISION NOT NULL,temperature DOUBLE PRECISION NOT NULL,humidity DOUBLE PRECISION NOT NULL)");
            statement.execute("INSERT INTO sensor_data VALUES(501,7,20,60)");
            // Automatic baseline is disabled: require explicit operator approval after schema inspection.
            assertThrows(Exception.class,()->flyway(schema).migrate());
            flyway(schema).baseline(); flyway(schema).migrate();
            try(var rows=statement.executeQuery("SELECT id,captured_at,prediction_status FROM sensor_data")) {
                assertTrue(rows.next()); assertEquals(501,rows.getLong(1)); assertNull(rows.getObject(2)); assertEquals("NOT_REQUESTED",rows.getString(3));
            }
            try(var rows=statement.executeQuery("SELECT nextval('sensor_data_seq')")) { rows.next(); assertEquals(1001,rows.getLong(1)); }
        }
    }
}
