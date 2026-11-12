package com.codewithmosh.plantclassifier.mqtt;

import org.eclipse.paho.client.mqttv3.*;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

/** Real broker; mock firmware. The URL is created by scripts/test-mqtt.sh, never a LAN device. */
@EnabledIfEnvironmentVariable(named="MQTT_TEST_URL", matches="tcp://127\\.0\\.0\\.1:[0-9]+")
class MqttTransportTest {
    static final JsonMapper JSON = JsonMapper.builder().build();
    static final String CONNECTION = "a".repeat(32);
    MqttDeviceTransport transport;
    MqttClient mock;
    BlockingQueue<JsonNode> commands;
    ScheduledExecutorService pulse;
    @BeforeEach void setup() throws Exception {
        commands = new LinkedBlockingQueue<>();
        String url = System.getenv("MQTT_TEST_URL");
        mock = new MqttClient(url, "mock-esp32-" + UUID.randomUUID(), new MemoryPersistence());
        mock.setCallback(new MqttCallback() {
            public void connectionLost(Throwable e) {}
            public void deliveryComplete(IMqttDeliveryToken token) {}
            public void messageArrived(String topic, MqttMessage message) {
                assertFalse(message.isRetained()); assertEquals(0, message.getQos());
                var value = (tools.jackson.databind.node.ObjectNode) JSON.readTree(message.getPayload());
                value.put("_role", topic.split("/")[2]); commands.add(value);
            }
        });
        connectMock(); mock.subscribe("plant/v1/movement/command", 0); mock.subscribe("plant/v1/movement/urgent", 0);
        mock.subscribe("plant/v1/sensor/command", 0); mock.subscribe("plant/v1/sensor/urgent", 0);
        transport = new MqttDeviceTransport("mqtt", url, "backend", "test-only-not-a-real-secret", Duration.ofMillis(400));
        pulse = Executors.newSingleThreadScheduledExecutor();
        pulse.scheduleAtFixedRate(() -> {
            try { mock.publish("plant/v1/movement/state", ("{\"online\":true,\"connectionId\":\"" + CONNECTION + "\"}").getBytes(StandardCharsets.UTF_8), 0, false); }
            catch (MqttException ignored) {}
        }, 0, 50, TimeUnit.MILLISECONDS);
        long end = System.nanoTime() + 5_000_000_000L;
        while (System.nanoTime() < end) {
            var ready = transport.request("movement", "GET", "/status", new byte[0]);
            if (!ready.isCompletedExceptionally()) {
                var command = take(); ack(command, false, CONNECTION); ready.get(1, TimeUnit.SECONDS); return;
            }
            Thread.sleep(25);
        }
        fail("Test broker never became ready");
    }
    void connectMock() throws Exception {
        for (int attempt = 0; attempt < 40; attempt++) {
            try { mock.connect(); return; } catch (MqttException e) { if (attempt == 39) throw e; Thread.sleep(100); }
        }
    }
    JsonNode take() throws Exception { var value = commands.poll(2, TimeUnit.SECONDS); assertNotNull(value); return value; }
    void ack(JsonNode command, boolean retained, String connection) throws Exception {
        mock.publish("plant/v1/"+command.path("_role").asString("movement")+"/ack", JSON.writeValueAsBytes(Map.of("id", command.get("id").asString(),
            "connectionId", connection, "status", 200, "body", Map.of("status", "OK"))), 0, retained);
    }
    @AfterEach void close() throws Exception {
        if (pulse != null) pulse.shutdownNow();
        if (transport != null) transport.close();
        if (mock != null) { if (mock.isConnected()) mock.disconnect(); mock.close(); }
    }
    @Test void publicationIsNotAnAckAndStopBypassesPendingMovement() throws Exception {
        var normal = transport.request("movement", "POST", "/movement", "{\"command\":\"FORWARD\"}".getBytes(StandardCharsets.UTF_8));
        var first = take(); assertFalse(normal.isDone());
        var stop = transport.request("movement", "POST", "/movement", "{\"command\":\"STOP\"}".getBytes(StandardCharsets.UTF_8));
        var second = take(); ack(second, false, CONNECTION);
        assertEquals(200, stop.get(1, TimeUnit.SECONDS).get("status").asInt());
        assertFalse(normal.isDone()); ack(first, false, CONNECTION); normal.get(1, TimeUnit.SECONDS);
    }
    @Test void wrongConnectionAndDuplicateAcksCannotCompleteAnotherCommand() throws Exception {
        var pending = transport.request("movement", "GET", "/status", new byte[0]); var first = take();
        ack(first, false, "b".repeat(32)); Thread.sleep(30); assertFalse(pending.isDone());
        ack(first, false, CONNECTION); pending.get(1, TimeUnit.SECONDS);
        var next = transport.request("movement", "GET", "/status", new byte[0]); var second = take();
        ack(first, false, CONNECTION); Thread.sleep(30); assertFalse(next.isDone());
        ack(second, false, CONNECTION); next.get(1, TimeUnit.SECONDS);
    }
    @Test void timeoutIsBoundedAndLateAckDoesNotResurrectFuture() throws Exception {
        var pending = transport.request("movement", "GET", "/status", new byte[0]); var command = take();
        var failure = assertThrows(ExecutionException.class, () -> pending.get(1, TimeUnit.SECONDS));
        assertInstanceOf(TimeoutException.class, failure.getCause());
        ack(command, false, CONNECTION); assertTrue(pending.isCompletedExceptionally());
    }
    @Test void disconnectFailsPendingAndRequiresFreshPresence() throws Exception {
        var pending = transport.request("movement", "GET", "/status", new byte[0]); take();
        pulse.shutdownNow();
        mock.publish("plant/v1/movement/state", "{\"online\":false}".getBytes(StandardCharsets.UTF_8), 0, false);
        assertThrows(ExecutionException.class, () -> pending.get(1, TimeUnit.SECONDS));
        assertTrue(transport.request("movement", "GET", "/status", new byte[0]).isCompletedExceptionally());
    }
    @Test void retainedPresenceCannotAuthorizeRequests() throws Exception {
        pulse.shutdownNow();
        var message = new MqttMessage(("{\"online\":true,\"connectionId\":\""+CONNECTION+"\"}").getBytes(StandardCharsets.UTF_8));
        // Explicit callback test: brokers deliver live retained publications with RETAIN=0.
        transport.receive("plant/v1/movement/state", new MqttMessage("{\"online\":false}".getBytes(StandardCharsets.UTF_8)));
        message.setRetained(true); transport.receive("plant/v1/movement/state", message);
        assertTrue(transport.request("movement", "GET", "/status", new byte[0]).isCompletedExceptionally());
    }
    @Test void brokerRestartNeverReplaysUnacknowledgedCommands() throws Exception {
        pulse.shutdownNow();
        var pending = transport.request("movement", "POST", "/movement", "{\"command\":\"FORWARD\"}".getBytes(StandardCharsets.UTF_8)); take();
        String container = System.getenv("MQTT_TEST_CONTAINER");
        assertEquals(0, new ProcessBuilder("docker", "restart", container).start().waitFor());
        assertThrows(ExecutionException.class, () -> pending.get(1, TimeUnit.SECONDS));
        if (mock.isConnected()) mock.disconnectForcibly();
        connectMock(); mock.subscribe("plant/v1/movement/command", 0);
        Thread.sleep(3500); assertNull(commands.poll());
        assertTrue(transport.request("movement", "GET", "/status", new byte[0]).isCompletedExceptionally());
    }
    @Test void servicesRoundTripThroughBrokerAndBothSimulatedBoards() throws Exception {
        mock.publish("plant/v1/sensor/state", ("{\"online\":true,\"connectionId\":\""+CONNECTION+"\"}").getBytes(StandardCharsets.UTF_8), 0, false);
        Thread.sleep(100);
        var responder = CompletableFuture.runAsync(() -> {
            try {
                for (int i=0; i<6; i++) {
                    var command = take(); var body = command.get("body");
                    String path = command.get("path").asString();
                    Map<String, Object> reply;
                    if (path.equals("/control-session")) reply=Map.of("sessionId", "c".repeat(32), "deviceTimeMs", 1000, "protocolVersion", 2);
                    else if (path.equals("/movement")) reply=Map.of("status", "OK", "command", body.get("command").asString(),
                            "speed", body.get("speed").asInt(), "sessionId", body.get("sessionId").asString(),
                            "sequence", body.get("sequence").asLong(), "simulated", true, "steering", body.get("steering").asString(), "protocolVersion", 2);
                    else reply=Map.of("angle", 100, "state", body.path("command").asString().equals("INCREASE") ? "increasing" : "holding",
                            "epoch", 5, "deviceTimeMs", 1000, "sequence", body.path("sequence").asLong(0));
                    mock.publish("plant/v1/"+command.get("_role").asString()+"/ack", JSON.writeValueAsBytes(Map.of(
                            "id", command.get("id").asString(), "connectionId", CONNECTION, "status", 200, "body", reply)), 0, false);
                }
            } catch (Exception e) { throw new CompletionException(e); }
        });
        var movementClient = org.springframework.web.client.RestClient.builder().baseUrl("http://mock.invalid")
                .requestInterceptor((r,b,e) -> transport.exchange("movement", r.getMethod().name(), r.getURI().getPath(), b)).build();
        var sensorClient = org.springframework.web.client.RestClient.builder().baseUrl("http://mock.invalid")
                .requestInterceptor((r,b,e) -> transport.exchange("sensor", r.getMethod().name(), r.getURI().getPath(), b)).build();
        var movement = new com.codewithmosh.plantclassifier.service.MovementService(movementClient);
        var servo = new com.codewithmosh.plantclassifier.service.ServoService(sensorClient);
        var session = movement.acquire("test-owner");
        assertEquals("FORWARD", movement.sendCommand(new com.codewithmosh.plantclassifier.dto.MovementRequestDTO("FORWARD",150,session.sessionId(),1L,"LEFT"), "test-owner").command());
        assertEquals("STOP", movement.sendCommand(new com.codewithmosh.plantclassifier.dto.MovementRequestDTO("STOP",0,session.sessionId(),2L,"CENTER"), "test-owner").command());
        var servoSession=servo.acquire("test-owner");
        assertEquals("increasing", servo.command(new com.codewithmosh.plantclassifier.dto.ServoRequest("INCREASE",servoSession.epoch(),1L), "test-owner").state());
        assertEquals("holding", servo.command(new com.codewithmosh.plantclassifier.dto.ServoRequest("HOLD",servoSession.epoch(),2L), "test-owner").state());
        responder.get(2, TimeUnit.SECONDS);
    }
    @Test void readOnlyLoopbackLatencySample() throws Exception {
        double[] samples = new double[100];
        for (int i=0; i<samples.length; i++) {
            long start=System.nanoTime();
            var request=transport.request("movement", "GET", "/status", new byte[0]);
            ack(take(), false, CONNECTION); request.get(1, TimeUnit.SECONDS);
            samples[i]=(System.nanoTime()-start)/1_000_000.0;
        }
        Arrays.sort(samples);
        System.out.printf(java.util.Locale.ROOT, "MOCK MQTT RTT n=100 loss=0 p50=%.3f p95=%.3f p99=%.3f max=%.3f ms%n", samples[49],samples[94],samples[98],samples[99]);
    }
    @Test void slowCaptureUsesSeparateBudgetAndHoldDoesNotWait() throws Exception {
        transport.receive("plant/v1/sensor/state", new MqttMessage(JSON.writeValueAsBytes(Map.of("online",true,"connectionId",CONNECTION))));
        var capture=transport.request("sensor","GET","/capture",new byte[0]); var first=take();
        Thread.sleep(650); assertFalse(capture.isDone());
        var hold=transport.request("sensor","POST","/servo","{\"command\":\"HOLD\"}".getBytes(StandardCharsets.UTF_8));
        ack(take(),false,CONNECTION); hold.get(1,TimeUnit.SECONDS);
        assertFalse(capture.isDone()); ack(first,false,CONNECTION); capture.get(1,TimeUnit.SECONDS);
    }
    @Test void changedConnectionRejectsPreviousAckAndExpiredPresenceRejectsNewWork() throws Exception {
        pulse.shutdownNow();
        var request=transport.request("movement","GET","/status",new byte[0]); var old=take();
        transport.receive("plant/v1/movement/state",new MqttMessage(JSON.writeValueAsBytes(Map.of("online",true,"connectionId","b".repeat(32)))));
        ack(old,false,CONNECTION);
        assertThrows(ExecutionException.class,()->request.get(1,TimeUnit.SECONDS));
        Thread.sleep(3100);
        assertTrue(transport.request("movement","GET","/status",new byte[0]).isCompletedExceptionally());
    }
    @Test void saturatedNormalCapacityStillAdmitsStop() throws Exception {
        for(int i=0;i<48;i++) transport.request("movement","GET","/status",new byte[0]);
        var overflow=transport.request("movement","GET","/status",new byte[0]);
        var failure=assertThrows(ExecutionException.class,()->overflow.get(1,TimeUnit.SECONDS));
        assertEquals("mqtt-busy",((com.codewithmosh.plantclassifier.exception.SystemFailure)failure.getCause()).category());
        var stop=transport.request("movement","POST","/movement","{\"command\":\"STOP\"}".getBytes(StandardCharsets.UTF_8));
        JsonNode command;
        do {command=take();} while(!command.path("body").path("command").asString("").equals("STOP"));
        ack(command,false,CONNECTION); assertEquals(200,stop.get(1,TimeUnit.SECONDS).path("status").asInt());
    }
}
