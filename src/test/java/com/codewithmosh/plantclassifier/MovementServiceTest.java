package com.codewithmosh.plantclassifier;

import com.codewithmosh.plantclassifier.dto.*;
import com.codewithmosh.plantclassifier.service.MovementService;
import com.codewithmosh.plantclassifier.exception.SystemFailure;
import org.junit.jupiter.api.*;
import org.springframework.http.MediaType;
import org.springframework.http.HttpMethod;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import static org.junit.jupiter.api.Assertions.*;

class MovementServiceTest {
    private MockRestServiceServer server;
    private MovementService service;
    private final String id = "a".repeat(32);
    @BeforeEach void setup() {
        var builder=RestClient.builder().baseUrl("http://robot.test").defaultHeader("X-Device-Token","test-token");
        server=MockRestServiceServer.bindTo(builder).build();
        service=new MovementService(builder.build());
    }
    void acquire() {
        server.expect(requestTo("http://robot.test/control-session")).andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess("{\"sessionId\":\""+id+"\",\"deviceTimeMs\":1000}",MediaType.APPLICATION_JSON));
        assertEquals(id,service.acquire("owner").sessionId());
        server.verify(); server.reset();
    }
    void expectCommand(String command,long sequence) {
        server.expect(requestTo("http://robot.test/movement"))
                .andExpect(method(HttpMethod.POST)).andExpect(header("X-Device-Token","test-token"))
                .andExpect(content().json("{\"command\":\""+command+"\",\"speed\":150,\"sessionId\":\""+id+"\",\"sequence\":"+sequence+"}"))
                .andRespond(withSuccess("{\"status\":\"OK\",\"command\":\""+command+"\",\"speed\":150,\"simulated\":true,\"sessionId\":\""+id+"\",\"sequence\":"+sequence+"}",MediaType.APPLICATION_JSON));
    }
    @Test void sendsExpectedJsonAndReturnsDeviceAcknowledgement() {
        acquire(); expectCommand("FORWARD",1);
        var ack=service.sendCommand(new MovementRequestDTO("FORWARD",150,id,1L),"owner");
        assertTrue(ack.simulated()); assertEquals("FORWARD",ack.command()); server.verify();
    }
    @Test void stopClosesEpochAndRejectsLateHigherAndLowerSequences() {
        acquire(); expectCommand("STOP",2);
        service.sendCommand(new MovementRequestDTO("STOP",150,id,2L),"owner");
        for(long sequence:new long[]{1,2,3}) assertEquals(409,assertThrows(SystemFailure.class,
                ()->service.sendCommand(new MovementRequestDTO("FORWARD",150,id,sequence),"owner")).status());
        server.verify();
    }
    @Test void rejectsDuplicatesAndOtherOwners() {
        acquire(); expectCommand("LEFT",1);
        var command=new MovementRequestDTO("LEFT",150,id,1L);
        service.sendCommand(command,"owner");
        assertThrows(SystemFailure.class,()->service.sendCommand(command,"owner"));
        assertThrows(SystemFailure.class,()->service.sendCommand(new MovementRequestDTO("LEFT",150,id,2L),"other"));
        server.verify();
    }
    @Test void rejectsEmptyAcknowledgement() {
        acquire(); server.expect(requestTo("http://robot.test/movement")).andRespond(withSuccess());
        assertEquals(502,assertThrows(SystemFailure.class,()->service.sendCommand(new MovementRequestDTO("STOP",0,id,1L),"owner")).status());
    }
    @Test void logoutStopsOnlyTheOwningSession() {
        acquire(); service.release("other");
        server.expect(requestTo("http://robot.test/movement"))
                .andExpect(content().json("{\"command\":\"STOP\",\"speed\":0}"))
                .andRespond(withSuccess("{\"status\":\"OK\",\"command\":\"STOP\",\"speed\":0,\"simulated\":true,\"sessionId\":\""+id+"\",\"sequence\":1}", MediaType.APPLICATION_JSON));
        service.release("owner"); server.verify();
        assertThrows(SystemFailure.class, () -> service.sendCommand(new MovementRequestDTO("FORWARD",150,id,2L),"owner"));
    }

}
