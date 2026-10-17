package com.codewithmosh.plantclassifier;

import com.codewithmosh.plantclassifier.config.DeviceClients;
import com.codewithmosh.plantclassifier.dto.MovementRequestDTO;
import com.codewithmosh.plantclassifier.exception.SystemFailure;
import com.codewithmosh.plantclassifier.service.MovementService;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.springframework.web.client.ResourceAccessException;
import tools.jackson.databind.json.JsonMapper;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.junit.jupiter.api.Assertions.*;

class DeviceHttpTest {
    HttpServer server;
    ExecutorService executor;
    String url;
    final String id="a".repeat(32);
    final String token="isolated-test-token-32-characters";
    @BeforeEach void setup() throws Exception {
        server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        executor=Executors.newCachedThreadPool(); server.setExecutor(executor); server.start();
        url="http://127.0.0.1:"+server.getAddress().getPort();
    }
    @AfterEach void cleanup() { if(server!=null)server.stop(0); if(executor!=null)executor.shutdownNow(); }
    @Test void readTimeoutIsActuallyBounded() {
        server.createContext("/control-session",exchange->{
            try { Thread.sleep(500); } catch(InterruptedException ex) { Thread.currentThread().interrupt(); }
            exchange.close();
        });
        var service=new MovementService(DeviceClients.client(url,token,Duration.ofMillis(200),Duration.ofMillis(50)));
        assertTimeoutPreemptively(Duration.ofSeconds(2),()->assertThrows(ResourceAccessException.class,()->service.acquire("owner")));
    }
    @Test void delayedForwardCannotExecuteAfterStopAndTokenIsSent() throws Exception {
        AtomicBoolean active=new AtomicBoolean(true);
        AtomicBoolean forwardExecuted=new AtomicBoolean(false);
        AtomicReference<String> receivedToken=new AtomicReference<>();
        AtomicReference<String> receivedLength=new AtomicReference<>();
        CountDownLatch forwardArrived=new CountDownLatch(1);
        CountDownLatch stopAccepted=new CountDownLatch(1);
        server.createContext("/control-session",exchange->{
            byte[] body=("{\"sessionId\":\""+id+"\",\"deviceTimeMs\":1000}").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200,body.length); exchange.getResponseBody().write(body); exchange.close();
        });
        server.createContext("/movement",exchange->{
            receivedToken.set(exchange.getRequestHeaders().getFirst("X-Device-Token"));
            receivedLength.set(exchange.getRequestHeaders().getFirst("Content-Length"));
            var json=JsonMapper.builder().build().readTree(exchange.getRequestBody());
            String command=json.get("command").asString();
            if(command.equals("FORWARD")) {
                forwardArrived.countDown();
                try { stopAccepted.await(2,TimeUnit.SECONDS); } catch(InterruptedException ex) { Thread.currentThread().interrupt(); }
                if(!active.get()) { exchange.sendResponseHeaders(409,-1); exchange.close(); return; }
                forwardExecuted.set(true);
            } else { active.set(false); stopAccepted.countDown(); }
            byte[] body=("{\"status\":\"OK\",\"command\":\""+command+"\",\"speed\":0,\"simulated\":true,\"sessionId\":\""+id+"\",\"sequence\":"+json.get("sequence").longValue()+"}").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200,body.length); exchange.getResponseBody().write(body); exchange.close();
        });
        var service=new MovementService(DeviceClients.client(url,token,Duration.ofMillis(200),Duration.ofSeconds(2)));
        service.acquire("owner");
        var forward=CompletableFuture.runAsync(()->service.sendCommand(new MovementRequestDTO("FORWARD",150,id,1L),"owner"));
        assertTrue(forwardArrived.await(1,TimeUnit.SECONDS));
        assertEquals("STOP",service.sendCommand(new MovementRequestDTO("STOP",0,id,2L),"owner").command());
        var failure=assertThrows(ExecutionException.class,()->forward.get(2,TimeUnit.SECONDS));
        assertInstanceOf(SystemFailure.class,failure.getCause()); assertFalse(forwardExecuted.get());
        assertEquals(token,receivedToken.get());
        assertNotNull(receivedLength.get()); assertTrue(Integer.parseInt(receivedLength.get()) > 0);
    }
}
