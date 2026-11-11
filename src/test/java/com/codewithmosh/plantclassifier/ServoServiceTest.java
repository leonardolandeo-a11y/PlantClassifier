package com.codewithmosh.plantclassifier;
import com.codewithmosh.plantclassifier.dto.*;
import com.codewithmosh.plantclassifier.service.ServoService;
import com.codewithmosh.plantclassifier.exception.SystemFailure;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import static org.junit.jupiter.api.Assertions.*;
class ServoServiceTest {
    @Test void sensorRouteTokenAndStopInvalidateCommands() {
        var builder=RestClient.builder().baseUrl("http://sensors.test").defaultHeader("X-Device-Token","mock-token");
        var server=MockRestServiceServer.bindTo(builder).build();
        var service=new ServoService(builder.build());
        String json="{\"angle\":100,\"state\":\"holding\",\"epoch\":1,\"deviceTimeMs\":1000}";
        server.expect(requestTo("http://sensors.test/servo-session")).andExpect(header("X-Device-Token","mock-token"))
            .andRespond(withSuccess(json,MediaType.APPLICATION_JSON));
        service.acquire("owner"); server.verify(); server.reset();
        assertThrows(SystemFailure.class,()->service.command(new ServoRequest("INCREASE",1L,1L),"other"));
        server.expect(requestTo("http://sensors.test/servo")).andExpect(header("X-Device-Token","mock-token"))
            .andExpect(content().json("{\"command\":\"HOLD\",\"epoch\":1,\"sequence\":2}"))
            .andRespond(withSuccess(json,MediaType.APPLICATION_JSON));
        assertEquals(100,service.command(new ServoRequest("HOLD",1L,2L),"owner").angle());
        assertThrows(SystemFailure.class,()->service.command(new ServoRequest("INCREASE",1L,3L),"owner"));
        server.verify();
    }
    @Test void rejectsUnsafeDeviceAngleAndInvalidCommands() {
        var builder=RestClient.builder().baseUrl("http://sensors.test");
        var server=MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://sensors.test/servo")).andRespond(withSuccess("{\"angle\":180,\"state\":\"holding\",\"epoch\":0,\"deviceTimeMs\":0}",MediaType.APPLICATION_JSON));
        assertThrows(SystemFailure.class,()->new ServoService(builder.build()).status());
        try(var factory=jakarta.validation.Validation.buildDefaultValidatorFactory()) {
            assertFalse(factory.getValidator().validate(new ServoRequest("FORWARD",0L,-1L)).isEmpty());
        }
        server.verify();
    }
    @Test void acquisitionLatencyIsNotAddedToDeviceDeadline() {
        var builder=RestClient.builder().baseUrl("http://sensors.test");
        var server=MockRestServiceServer.bindTo(builder).build();
        String json="{\"angle\":100,\"state\":\"holding\",\"epoch\":1,\"deviceTimeMs\":1000}";
        server.expect(requestTo("http://sensors.test/servo-session")).andRespond(request -> {
            try { Thread.sleep(400); } catch(InterruptedException ex) { Thread.currentThread().interrupt(); }
            return withSuccess(json,MediaType.APPLICATION_JSON).createResponse(request);
        });
        server.expect(requestTo("http://sensors.test/servo")).andExpect(request -> {
            var body=((org.springframework.mock.http.client.MockClientHttpRequest)request).getBodyAsString();
            long deadline=tools.jackson.databind.json.JsonMapper.builder().build().readTree(body).get("deadlineMs").longValue();
            assertTrue(deadline >= 1750 && deadline < 2000, "Acquisition RTT must not shift deadline beyond device window");
        }).andRespond(withSuccess(json,MediaType.APPLICATION_JSON));
        var service=new ServoService(builder.build());
        service.acquire("owner");
        service.command(new ServoRequest("INCREASE",1L,1L),"owner");
        server.verify();
    }

}
