package com.codewithmosh.plantclassifier.mqtt;
import org.junit.jupiter.api.Test;
import java.time.Duration;
import static org.junit.jupiter.api.Assertions.*;
class MqttBudgetsTest {
    @Test void captureBudgetIsIndependentOfActuationAndSafety() throws Exception {
        try (var transport = new MqttDeviceTransport("http", "", "", "", Duration.ofMillis(300))) {
            assertEquals(300, transport.timeoutFor("/movement", false));
            assertEquals(300, transport.timeoutFor("/servo", true));
            assertEquals(3000, transport.timeoutFor("/capture", false));
        }
    }
    @Test void timedOutAckDoesNotReleaseCapacityWhilePublicationIsStillQueued() {
        var response=new java.util.concurrent.CompletableFuture<Void>();
        var publication=new java.util.concurrent.CompletableFuture<Void>();
        var releases=new java.util.concurrent.atomic.AtomicInteger();
        MqttDeviceTransport.releaseAfterSettlement(response,publication,releases::incrementAndGet);
        response.completeExceptionally(new java.util.concurrent.TimeoutException());
        assertEquals(0,releases.get(),"Queued publication must continue occupying capacity");
        publication.complete(null);
        assertEquals(1,releases.get());
        publication.completeExceptionally(new IllegalStateException());
        assertEquals(1,releases.get(),"Duplicate callbacks must not inflate capacity");
    }
}
