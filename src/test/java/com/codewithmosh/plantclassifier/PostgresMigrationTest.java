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
        var result=flyway(schema).migrate(); assertEquals(7,result.migrationsExecuted);
        try(var connection=DriverManager.getConnection(url,user,password);var statement=connection.createStatement()) {
            statement.execute("SET search_path TO "+schema);
            statement.execute("INSERT INTO sensor_data(id,ph,temperature,humidity,captured_at,simulated,prediction_status) VALUES(nextval('sensor_data_seq'),7,20,60,CURRENT_TIMESTAMP,true,'PENDING')");
            try(var rows=statement.executeQuery("SELECT count(*) FROM sensor_data")) { rows.next(); assertEquals(1,rows.getInt(1)); }
        }
    }
    @Test void upgradesV3WithoutChangingMeasurements() throws Exception {
        String schema="v3_"+UUID.randomUUID().toString().replace("-","");
        Flyway.configure().dataSource(url,user,password).schemas(schema)
                .locations("classpath:db/migration").target("3").load().migrate();
        try(var connection=DriverManager.getConnection(url,user,password);var statement=connection.createStatement()) {
            statement.execute("SET search_path TO "+schema);
            statement.execute("INSERT INTO sensor_data(id,ph,temperature,humidity,prediction_status) VALUES(501,7,20,60,'PENDING')");
            assertEquals(4,flyway(schema).migrate().migrationsExecuted);
            try(var rows=statement.executeQuery("SELECT humidity,soil_moisture,soil_moisture_source FROM sensor_data WHERE id=501")) {
                assertTrue(rows.next()); assertEquals(60,rows.getDouble(1)); assertNull(rows.getObject(2)); assertNull(rows.getObject(3));
            }
            statement.execute("UPDATE sensor_data SET soil_moisture=45,soil_moisture_source='resistive-analog' WHERE id=501");
            try(var rows=statement.executeQuery("SELECT humidity,soil_moisture FROM sensor_data WHERE id=501")) {
                assertTrue(rows.next()); assertEquals(60,rows.getDouble(1)); assertEquals(45,rows.getDouble(2));
            }
            assertThrows(SQLException.class,()->statement.execute("UPDATE sensor_data SET soil_moisture=101"));
        }
    }
    @Test void v5PreservesV4SoilAndLeavesHistoricalStatusUnknown() throws Exception {
        String schema="v4_"+UUID.randomUUID().toString().replace("-","");
        Flyway.configure().dataSource(url,user,password).schemas(schema)
                .locations("classpath:db/migration").target("4").load().migrate();
        try(var connection=DriverManager.getConnection(url,user,password);var statement=connection.createStatement()) {
            statement.execute("SET search_path TO "+schema);
            statement.execute("INSERT INTO sensor_data(id,ph,temperature,humidity,prediction_status,soil_moisture) VALUES(501,7,20,60,'PENDING',75)");
            assertEquals(3,flyway(schema).migrate().migrationsExecuted);
            try(var rows=statement.executeQuery("SELECT soil_moisture,soil_status,prediction_model FROM sensor_data WHERE id=501")) {
                assertTrue(rows.next()); assertEquals(75,rows.getDouble(1)); assertNull(rows.getString(2)); assertNull(rows.getString(3));
            }
            statement.execute("UPDATE sensor_data SET soil_status='calibrated' WHERE id=501");
            try(var rows=statement.executeQuery("SELECT soil_status FROM sensor_data WHERE id=501")) {
                assertTrue(rows.next()); assertEquals("calibrated",rows.getString(1));
            }
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
            try(var rows=statement.executeQuery("SELECT id,captured_at,prediction_status,soil_moisture,soil_moisture_source FROM sensor_data")) {
                assertTrue(rows.next()); assertEquals(501,rows.getLong(1)); assertNull(rows.getObject(2)); assertEquals("NOT_REQUESTED",rows.getString(3)); assertNull(rows.getObject(4)); assertNull(rows.getObject(5));
            }
            try(var rows=statement.executeQuery("SELECT nextval('sensor_data_seq')")) { rows.next(); assertEquals(1001,rows.getLong(1)); }
        }
    }
    @Test void sampleIdentityRejectsDuplicatesButPreservesLegacyRows() throws Exception {
        String schema="identity_"+UUID.randomUUID().toString().replace("-", "");
        flyway(schema).migrate();
        try(var connection=DriverManager.getConnection(url,user,password);var statement=connection.createStatement()) {
            statement.execute("SET search_path TO "+schema);
            String insert="INSERT INTO sensor_data(id,ph,temperature,humidity,prediction_status,device_id,sample_id) VALUES(nextval('sensor_data_seq'),7,20,60,'PENDING',";
            statement.execute(insert+"'sensor','boot-1')");
            assertThrows(SQLException.class, () -> statement.execute(insert+"'sensor','boot-1')"));
            statement.execute(insert+"'sensor','boot-2')");
            statement.execute(insert+"NULL,NULL)"); statement.execute(insert+"NULL,NULL)");
            assertThrows(SQLException.class, () -> statement.execute(insert+"'sensor',NULL)"));
        }
    }
    @Test void concurrentDuplicateWaitsForCommitAndNeverCreatesTwoRows() throws Exception {
        String schema="concurrent_"+UUID.randomUUID().toString().replace("-", "");
        flyway(schema).migrate();
        try(var first=DriverManager.getConnection(url,user,password);var insert=first.createStatement()) {
            first.setAutoCommit(false); insert.execute("SET search_path TO "+schema);
            String sql="INSERT INTO sensor_data(id,ph,temperature,humidity,prediction_status,device_id,sample_id) VALUES(nextval('sensor_data_seq'),7,20,60,'PENDING','sensor','boot-1')";
            insert.execute(sql);
            var competing=java.util.concurrent.CompletableFuture.supplyAsync(()->{
                try(var second=DriverManager.getConnection(url,user,password);var statement=second.createStatement()) {
                    statement.execute("SET search_path TO "+schema); statement.execute(sql); return "unexpected-success";
                } catch(SQLException error) {return error.getSQLState();}
            });
            first.commit();
            assertEquals("23505",competing.get(5,java.util.concurrent.TimeUnit.SECONDS));
            try(var rows=insert.executeQuery("SELECT count(*) FROM sensor_data")) {rows.next();assertEquals(1,rows.getInt(1));}
        }
    }
    @Test void failedMigrationRollsBackDdlAndPreservesV7(@org.junit.jupiter.api.io.TempDir java.nio.file.Path migration) throws Exception {
        String schema="rollback_"+UUID.randomUUID().toString().replace("-", "");
        flyway(schema).migrate();
        java.nio.file.Files.writeString(migration.resolve("V8__deliberate_test_failure.sql"), "CREATE TABLE rollback_probe(id INT); INSERT INTO missing_table VALUES(1);");
        var failing=Flyway.configure().dataSource(url,user,password).schemas(schema)
                .locations("classpath:db/migration","filesystem:"+migration).load();
        assertThrows(Exception.class,failing::migrate);
        try(var connection=DriverManager.getConnection(url,user,password);var statement=connection.createStatement()) {
            statement.execute("SET search_path TO "+schema);
            try(var rows=statement.executeQuery("SELECT to_regclass('rollback_probe')")) {rows.next();assertNull(rows.getObject(1));}
        }
        assertEquals(0,flyway(schema).migrate().migrationsExecuted);
    }
}
