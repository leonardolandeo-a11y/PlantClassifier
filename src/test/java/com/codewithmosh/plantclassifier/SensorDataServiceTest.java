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
        reading("{\"ph\":7,\"temperature\":20,\"humidity\":50,\"simulated\":true}");
        when(ml.predict(20,50,7)).thenReturn("arroz"); Instant before=Instant.now();
        var result=service.captureData();
        assertEquals(7,result.ph()); assertEquals("arroz",result.prediction()); assertEquals("SUCCEEDED",result.predictionStatus());
        assertFalse(result.capturedAt().isBefore(before)); verify(repository,times(2)).saveAndFlush(any()); server.verify();
    }
    @Test void mixedProvenancePersistsAndKeepsModelFeatureOrder() {
        reading("""
                {"ph":6.5,"temperature":25,"humidity":60,"simulated":false,
                 "temperatureSource":"dht11","humiditySource":"dht11","phSource":"potentiometer"}
                """);
        when(ml.predict(25,60,6.5)).thenReturn("arroz");
        var result=service.captureData();
        assertEquals("dht11",result.temperatureSource());
        assertEquals("dht11",result.humiditySource());
        assertEquals("potentiometer",result.phSource());
        assertTrue(result.simulated());
        verify(ml).predict(25,60,6.5);
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
        for(String json:new String[]{"", "{}", "{\"ph\":15,\"temperature\":20,\"humidity\":50,\"simulated\":true}",
                "{\"ph\":7,\"temperature\":100,\"humidity\":50,\"simulated\":true}",
                "{\"ph\":7,\"temperature\":20,\"humidity\":101,\"simulated\":true}"}) {
            server.reset(); reading(json);
            assertThrows(SystemFailure.class,()->service.captureData());
        }
        verifyNoInteractions(repository,ml);
    }
    @Test void mlFailureReturnsSavedPartialResult() {
        reading("{\"ph\":7,\"temperature\":20,\"humidity\":50,\"simulated\":true}");
        when(ml.predict(20,50,7)).thenThrow(new SystemFailure(504,"ml-timeout","Timed out"));
        var result=service.captureData();
        assertEquals("FAILED",result.predictionStatus()); assertEquals("ml-timeout",result.predictionError());
        assertNull(result.prediction()); verify(repository,times(2)).saveAndFlush(any());
    }
    @Test void latestUsesOrderedSingleRowQueryAndHandlesEmptyDatabase() {
        when(repository.findTopByOrderByIdDesc()).thenReturn(Optional.empty());
        assertTrue(service.getLatestSensorData().isEmpty());
        verify(repository).findTopByOrderByIdDesc(); verify(repository,never()).findAll();
    }
    @Test void malformedJsonNumericStringsAndNonFiniteValuesAreRejected() {
        for(String json:new String[]{"{", "{\"ph\":\"7\",\"temperature\":20,\"humidity\":50,\"simulated\":true}",
                "{\"ph\":7,\"temperature\":1e9999,\"humidity\":50,\"simulated\":true}",
                "{\"ph\":7,\"temperature\":20,\"humidity\":50,\"simulated\":\"true\"}"}) {
            server.reset(); reading(json); assertThrows(SystemFailure.class,()->service.captureData());
        }
        verifyNoInteractions(repository,ml);
    }
    @Test void persistenceFailurePreventsPrediction() {
        reading("{\"ph\":7,\"temperature\":20,\"humidity\":50,\"simulated\":true}");
        when(repository.saveAndFlush(any())).thenThrow(new org.springframework.dao.DataAccessResourceFailureException("test"));
        assertThrows(org.springframework.dao.DataAccessException.class,()->service.captureData());
        verifyNoInteractions(ml);
    }
}
