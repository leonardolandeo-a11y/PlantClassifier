package com.codewithmosh.plantclassifier;

import com.codewithmosh.plantclassifier.dto.*;
import com.codewithmosh.plantclassifier.service.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.client.RestClient;
import org.springframework.mock.http.client.MockClientHttpResponse;
import org.springframework.http.HttpStatus;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;

class AcquisitionPriorityTest {
    @ParameterizedTest @ValueSource(booleans={false,true})
    void priorityStopDoesNotWaitForAnotherAcquisition(boolean servo) throws Exception {
        var acquisitions = new AtomicInteger();
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        String id="a".repeat(32);
        var client=RestClient.builder().baseUrl("http://mock.invalid").requestInterceptor((r,b,e) -> {
            boolean acquire=r.getURI().getPath().endsWith("session");
            if (acquire && acquisitions.incrementAndGet()==2) {
                entered.countDown();
                try { assertTrue(release.await(3,TimeUnit.SECONDS)); }
                catch(InterruptedException ex) { Thread.currentThread().interrupt(); throw new java.io.IOException(ex); }
            }
            String response=servo ? "{\"angle\":100,\"state\":\"holding\",\"epoch\":1,\"deviceTimeMs\":1000}"
                    : acquire ? "{\"sessionId\":\""+id+"\",\"deviceTimeMs\":1000,\"protocolVersion\":2}"
                    : "{\"status\":\"OK\",\"command\":\"STOP\",\"speed\":0,\"simulated\":true,\"sessionId\":\""+id+"\",\"sequence\":1}";
            return new MockClientHttpResponse(response.getBytes(StandardCharsets.UTF_8),HttpStatus.OK);
        }).build();
        var movement=new MovementService(client); var sensor=new ServoService(client);
        Runnable acquire=() -> { if(servo) sensor.acquire("owner"); else movement.acquire("owner"); };
        acquire.run();
        try(var executor=Executors.newVirtualThreadPerTaskExecutor()) {
            var pending=executor.submit(acquire);
            try {
                assertTrue(entered.await(1,TimeUnit.SECONDS));
                var stop=executor.submit(() -> {
                    if(servo) sensor.command(new ServoRequest("HOLD",1L,1L),"owner");
                    else movement.sendCommand(new MovementRequestDTO("STOP",0,id,1L),"owner");
                });
                stop.get(300,TimeUnit.MILLISECONDS);
                assertFalse(pending.isDone());
            } finally { release.countDown(); }
            var failure=assertThrows(ExecutionException.class, () -> pending.get(1,TimeUnit.SECONDS));
            assertEquals("acquisition-cancelled", ((com.codewithmosh.plantclassifier.exception.SystemFailure)failure.getCause()).category());
            assertThrows(com.codewithmosh.plantclassifier.exception.SystemFailure.class, () -> {
                if(servo) sensor.command(new ServoRequest("INCREASE",1L,2L),"owner");
                else movement.sendCommand(new MovementRequestDTO("FORWARD",150,id,2L),"owner");
            });
        }
    }
}
