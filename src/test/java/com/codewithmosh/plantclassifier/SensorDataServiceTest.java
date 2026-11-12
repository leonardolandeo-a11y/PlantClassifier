package com.codewithmosh.plantclassifier;

import com.codewithmosh.plantclassifier.dto.*;
import com.codewithmosh.plantclassifier.model.SensorData;
import com.codewithmosh.plantclassifier.repository.SensorDataRepository;
import com.codewithmosh.plantclassifier.service.*;
import com.codewithmosh.plantclassifier.exception.SystemFailure;
import org.junit.jupiter.api.*;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import java.time.Instant;
import java.util.Optional;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import static org.junit.jupiter.api.Assertions.*;

class SensorDataServiceTest {
    SensorDataRepository repository;
    MLService ml;
    MockRestServiceServer server;
    SensorDataService service;
    @BeforeEach void setup() {
        repository=mock(SensorDataRepository.class); ml=mock(MLService.class);
        var builder=RestClient.builder().baseUrl("http://sensor.test");
        server=MockRestServiceServer.bindTo(builder).build();
        service=new SensorDataService(repository,ml,builder.build(),-40,85);
        when(repository.saveAndFlush(any())).thenAnswer(call->call.getArgument(0));
    }
    void reading(String json) { server.expect(requestTo("http://sensor.test/capture")).andRespond(withSuccess(json,MediaType.APPLICATION_JSON)); }
    @Test void capturePreservesValuesAndReceptionTimestamp() {
        reading("{\"ph\":7,\"temperature\":20,\"humidity\":50,\"simulated\":true,\"soilMoisture\":45,\"soilMoistureSource\":\"software\"}");
        when(ml.predict(20,50,7,45)).thenReturn("frijol"); Instant before=Instant.now();
        var result=service.captureData();
        assertEquals(7,result.ph()); assertEquals("frijol",result.prediction()); assertEquals("SUCCEEDED",result.predictionStatus());
        assertFalse(result.capturedAt().isBefore(before.truncatedTo(java.time.temporal.ChronoUnit.MICROS)));
        assertEquals(0,result.capturedAt().getNano()%1000);
        verify(repository,times(2)).saveAndFlush(any()); server.verify();
    }
    @Test void mixedProvenancePersistsAndKeepsModelFeatureOrder() {
        reading("""
                {"ph":6.5,"temperature":25,"humidity":60,"simulated":false,
                 "temperatureSource":"dht11","humiditySource":"dht11","phSource":"potentiometer","soilMoisture":45,"soilMoistureSource":"resistive-analog","soilStatus":"calibrated"}
                """);
        when(ml.predict(25,60,6.5,45)).thenReturn("frijol");
        var result=service.captureData();
        assertEquals("dht11",result.temperatureSource());
        assertEquals("dht11",result.humiditySource());
        assertEquals("potentiometer",result.phSource());
        assertTrue(result.simulated());
        verify(ml).predict(25,60,6.5,45);
        verify(repository,times(2)).saveAndFlush(argThat(row -> "potentiometer".equals(row.getPhSource())));
    }
    @Test void badSourceAndSensorFailureCannotBecomeSyntheticMeasurements() {
        reading("""
                {"ph":6.5,"temperature":25,"humidity":60,"simulated":true,"phSource":"dht11"}
                """);
        assertThrows(SystemFailure.class,()->service.captureData());
        server.reset();
        server.expect(requestTo("http://sensor.test/capture")).andRespond(withStatus(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE));
        assertThrows(SystemFailure.class,()->service.captureData());
        verifyNoInteractions(repository,ml);
    }
    @Test void invalidAndMissingReadingsAreNotPersisted() {
        for(String json:new String[]{"", "{}", "{\"ph\":15,\"temperature\":20,\"humidity\":50,\"simulated\":true,\"soilMoisture\":45,\"soilMoistureSource\":\"software\"}",
                "{\"ph\":7,\"temperature\":100,\"humidity\":50,\"simulated\":true,\"soilMoisture\":45,\"soilMoistureSource\":\"software\"}",
                "{\"ph\":7,\"temperature\":20,\"humidity\":101,\"simulated\":true,\"soilMoisture\":45,\"soilMoistureSource\":\"software\"}"}) {
            server.reset(); reading(json);
            assertThrows(SystemFailure.class,()->service.captureData());
        }
        verifyNoInteractions(repository,ml);
    }
    @Test void mlFailureReturnsSavedPartialResult() {
        reading("{\"ph\":7,\"temperature\":20,\"humidity\":50,\"simulated\":true,\"soilMoisture\":45,\"soilMoistureSource\":\"software\"}");
        when(ml.predict(20,50,7,45)).thenThrow(new SystemFailure(504,"ml-timeout","Timed out"));
        var result=service.captureData();
        assertEquals("FAILED",result.predictionStatus()); assertEquals("ml-timeout",result.predictionError());
        assertNull(result.prediction()); verify(repository,times(2)).saveAndFlush(any());
    }
    @Test void soilIsIndependentAndSurvivesPredictionFailure() {
        reading("""
            {"ph":7,"temperature":20,"humidity":60,"simulated":false,
             "soilMoisture":45,"soilMoistureSource":"software"}
            """);
        when(ml.predict(20,60,7,45)).thenThrow(new SystemFailure(504,"ml-timeout","Timed out"));
        var result=service.captureData();
        assertEquals(45,result.soilMoisture()); assertEquals(60,result.humidity());
        assertEquals("software",result.soilMoistureSource()); assertTrue(result.simulated());
        assertEquals("FAILED",result.predictionStatus());
        verify(repository,times(2)).saveAndFlush(argThat(row -> row.getSoilMoisture()==45));
    }
    @Test void outOfDomainMeasurementIsPreservedWithoutACrop() {
        reading("{\"ph\":9.1,\"temperature\":26.7,\"humidity\":68.4,\"simulated\":true,\"soilMoisture\":58,\"soilMoistureSource\":\"resistive-analog\",\"soilStatus\":\"calibrated\"}");
        when(ml.predict(26.7,68.4,9.1,58)).thenThrow(new SystemFailure(422,"ml-out-of-domain","Outside training domain"));
        var result=service.captureData();
        assertEquals("OUT_OF_DOMAIN",result.predictionStatus()); assertNull(result.prediction());
        assertEquals("ml-out-of-domain",result.predictionError());
        assertEquals("synthetic-five-crops-v2",result.predictionModel());
        assertEquals(58,result.soilMoisture()); assertEquals(9.1,result.ph());
        verify(repository,times(2)).saveAndFlush(any());
    }
    @Test void pendingCalibrationDoesNotBlockOtherMeasurements() {
        reading("""
            {"ph":7,"temperature":20,"humidity":60,"simulated":false,
             "soilMoisture":null,"soilMoistureSource":"resistive-analog"}
            """);
        var result=service.captureData(); assertNull(result.soilMoisture());
        assertEquals("PENDING",result.predictionStatus()); verifyNoInteractions(ml);
    }
    @Test void invalidSoilIsRejected() {
        for(String value:new String[]{"-1","101","\"45\"","1e9999"}) {
            server.reset();
            reading("{\"ph\":7,\"temperature\":20,\"humidity\":60,\"simulated\":false,\"soilMoistureSource\":\"resistive-analog\",\"soilMoisture\":"+value+"}");
            assertThrows(SystemFailure.class,()->service.captureData());
        }
        verifyNoInteractions(repository,ml);
    }
    @Test void soilStatusSurvivesCaptureAndLatestIncludingLegacyAndUnknown() {
        for (String status : new String[]{"calibrated", "invalid", "calibration-pending", "future-state", null}) {
            server.reset();
            String statusJson = status == null ? "" : ",\"soilStatus\":\""+status+"\"";
            reading("{\"ph\":7,\"temperature\":20,\"humidity\":60,\"simulated\":true"+statusJson+"}");
            assertEquals(status, service.captureData().soilStatus());
            var saved = new SensorData(); saved.setSoilStatus(status);
            when(repository.findTopByOrderByIdDesc()).thenReturn(Optional.of(saved));
            assertEquals(status, service.getLatestSensorData().orElseThrow().soilStatus());
        }
        verify(repository,times(1)).saveAndFlush(argThat(row -> "invalid".equals(row.getSoilStatus())));
    }
    @Test void invalidOrPendingStatusBlocksPredictionEvenWithNumber() {
        for(String status:new String[]{"invalid","calibration-pending"}) {
            server.reset();
            reading("{\"ph\":7,\"temperature\":20,\"humidity\":60,\"simulated\":true,\"soilMoisture\":45,\"soilMoistureSource\":\"software\",\"soilStatus\":\""+status+"\"}");
            var result=service.captureData(); assertEquals("PENDING",result.predictionStatus()); assertNull(result.prediction());
        }
        verifyNoInteractions(ml); verify(repository,times(2)).saveAndFlush(any());
    }
    @Test void latestUsesOrderedSingleRowQueryAndHandlesEmptyDatabase() {
        when(repository.findTopByOrderByIdDesc()).thenReturn(Optional.empty());
        assertTrue(service.getLatestSensorData().isEmpty());
        verify(repository).findTopByOrderByIdDesc(); verify(repository,never()).findAll();
    }
    @Test void malformedJsonNumericStringsAndNonFiniteValuesAreRejected() {
        for(String json:new String[]{"{", "{\"ph\":\"7\",\"temperature\":20,\"humidity\":50,\"simulated\":true,\"soilMoisture\":45,\"soilMoistureSource\":\"software\"}",
                "{\"ph\":7,\"temperature\":1e9999,\"humidity\":50,\"simulated\":true,\"soilMoisture\":45,\"soilMoistureSource\":\"software\"}",
                "{\"ph\":7,\"temperature\":20,\"humidity\":50,\"simulated\":\"true\"}"}) {
            server.reset(); reading(json); assertThrows(SystemFailure.class,()->service.captureData());
        }
        verifyNoInteractions(repository,ml);
    }
    @Test void persistenceFailurePreventsPrediction() {
        reading("{\"ph\":7,\"temperature\":20,\"humidity\":50,\"simulated\":true,\"soilMoisture\":45,\"soilMoistureSource\":\"software\"}");
        when(repository.saveAndFlush(any())).thenThrow(new org.springframework.dao.DataAccessResourceFailureException("test"));
        assertThrows(org.springframework.dao.DataAccessException.class,()->service.captureData());
        verifyNoInteractions(ml);
    }
    @Test void cachedSampleKeepsItsAgeAndExpiredSamplesAreNotSaved() {
        reading("{\"ph\":7,\"temperature\":20,\"humidity\":60,\"simulated\":true,\"sampleAgeMs\":1500}");
        Instant before = Instant.now();
        var result = service.captureData();
        assertTrue(result.capturedAt().isBefore(before.minusMillis(1400)));
        assertTrue(result.capturedAt().isAfter(before.minusMillis(1600)));
        server.reset(); clearInvocations(repository);
        reading("{\"ph\":7,\"temperature\":20,\"humidity\":60,\"simulated\":true,\"sampleAgeMs\":2001}");
        assertEquals("stale-sample", assertThrows(SystemFailure.class, service::captureData).category());
        verifyNoInteractions(repository, ml);
    }
    @Test void repeatedPhysicalSampleReturnsExistingMeasurementWithoutPredictionOrSave() {
        reading("{\"ph\":7,\"temperature\":20,\"humidity\":50,\"simulated\":true,\"deviceId\":\"sensor\",\"sampleId\":\"boot-1\"}");
        var existing = new SensorData(); existing.setId(42L); existing.setPredictionStatus("FAILED");
        when(repository.findByDeviceIdAndSampleId("sensor", "boot-1")).thenReturn(Optional.of(existing));
        assertEquals(42L, service.captureData().id());
        verify(repository, never()).saveAndFlush(any()); verifyNoInteractions(ml);
    }
    @Test void concurrentDuplicateInsertReturnsWinningRow() {
        reading("{\"ph\":7,\"temperature\":20,\"humidity\":50,\"simulated\":true,\"deviceId\":\"sensor\",\"sampleId\":\"boot-1\"}");
        var existing = new SensorData(); existing.setId(43L); existing.setPredictionStatus("PENDING");
        when(repository.findByDeviceIdAndSampleId("sensor", "boot-1")).thenReturn(Optional.empty(), Optional.of(existing));
        when(repository.saveAndFlush(any())).thenThrow(new org.springframework.dao.DataIntegrityViolationException("duplicate"));
        assertEquals(43L, service.captureData().id()); verifyNoInteractions(ml);
    }
    @Test void invalidPhysicalSensorIsDistinguishedFromNetworkFailure() {
        server.expect(requestTo("http://sensor.test/capture")).andRespond(withStatus(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)
                .contentType(MediaType.APPLICATION_JSON).body("{\"error\":\"DHT11 or pH ADC read failed or outside valid range\"}"));
        assertEquals("sensor-invalid",assertThrows(SystemFailure.class,()->service.captureData()).category());
        verifyNoInteractions(repository,ml);
    }
}
