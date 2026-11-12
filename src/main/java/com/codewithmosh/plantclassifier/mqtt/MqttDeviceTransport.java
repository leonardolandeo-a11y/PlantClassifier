package com.codewithmosh.plantclassifier.mqtt;

import com.codewithmosh.plantclassifier.exception.SystemFailure;
import jakarta.annotation.PreDestroy;
import org.eclipse.paho.client.mqttv3.*;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.http.*;
import org.springframework.http.client.ClientHttpResponse;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.io.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;

/** One connection, bounded pending requests, firmware ACKs only. Never queues offline commands. */
@Component
public class MqttDeviceTransport implements AutoCloseable {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private record Presence(String connection, long seen) {}
    private record Pending(String role, String connection, CompletableFuture<JsonNode> future, CompletableFuture<Void> published) {}
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(MqttDeviceTransport.class);
    private final Semaphore normalSlots = new Semaphore(48), safetySlots = new Semaphore(16);
    private final ConcurrentMap<String, Presence> presence = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, Pending> pending = new ConcurrentHashMap<>();
    private final ScheduledExecutorService clock = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "mqtt-deadlines"); t.setDaemon(true); return t;
    });
    private final MqttAsyncClient client;
    private final long timeoutMs, safetyTimeoutMs, acquisitionTimeoutMs, statusTimeoutMs, captureTimeoutMs;
    private volatile boolean subscribed;
    public MqttDeviceTransport(String transport, String url, String username, String password, Duration timeout) throws MqttException {
        this(transport, url, username, password, timeout, timeout, timeout, timeout, Duration.ofSeconds(3));
    }
    @org.springframework.beans.factory.annotation.Autowired
    public MqttDeviceTransport(@Value("${device.transport:http}") String transport,
            @Value("${mqtt.url:tcp://mosquitto:1883}") String url,
            @Value("${mqtt.username:backend}") String username,
            @Value("${mqtt.password:}") String password,
            @Value("${mqtt.movement-timeout:${mqtt.ack-timeout:600ms}}") Duration timeout,
            @Value("${mqtt.safety-timeout:600ms}") Duration safetyTimeout,
            @Value("${mqtt.acquisition-timeout:600ms}") Duration acquisitionTimeout,
            @Value("${mqtt.status-timeout:750ms}") Duration statusTimeout,
            @Value("${mqtt.capture-timeout:3s}") Duration captureTimeout) throws MqttException {
        if (!Set.of("http", "mqtt").contains(transport)) throw new IllegalArgumentException("DEVICE_TRANSPORT must be http or mqtt");
        timeoutMs = budget(timeout, 750);
        safetyTimeoutMs = budget(safetyTimeout, 750);
        acquisitionTimeoutMs = budget(acquisitionTimeout, 750);
        statusTimeoutMs = budget(statusTimeout, 1000);
        captureTimeoutMs = budget(captureTimeout, 5000);
        if (transport.equals("http")) { client = null; return; }
        if (password.isBlank()) throw new IllegalArgumentException("Configure MQTT_PASSWORD");
        client = new MqttAsyncClient(url, "plant-backend-" + UUID.randomUUID(), new MemoryPersistence());
        client.setCallback(new MqttCallbackExtended() {
            public void connectComplete(boolean reconnect, String serverURI) {
                subscribed = false; presence.clear(); failAll("broker-disconnected", "MQTT connection changed");
                try {
                    client.subscribe(new String[]{"plant/v1/+/state", "plant/v1/+/ack"}, new int[]{0, 0}, null,
                        new IMqttActionListener() {
                            public void onSuccess(IMqttToken token) { subscribed = true; }
                            public void onFailure(IMqttToken token, Throwable e) { subscribed = false; }
                        });
                } catch (MqttException ignored) { subscribed = false; }
            }
            public void connectionLost(Throwable cause) {
                subscribed = false; presence.clear(); failAll("broker-disconnected", "MQTT broker disconnected");
            }
            public void deliveryComplete(IMqttDeliveryToken token) { /* Broker receipt is NOT execution. */ }
            public void messageArrived(String topic, MqttMessage message) { receive(topic, message); }
        });
        var options = new MqttConnectOptions();
        options.setCleanSession(true); options.setAutomaticReconnect(false);
        options.setConnectionTimeout(2); options.setKeepAliveInterval(5);
        options.setUserName(username); options.setPassword(password.toCharArray());
        // Includes initial broker outage. One reconnect attempt at a time, no command buffer.
        clock.scheduleWithFixedDelay(() -> {
            if (!client.isConnected()) try { client.connect(options).waitForCompletion(2500); }
            catch (MqttException ignored) { /* State remains unavailable until subscribed. */ }
        }, 0, 3, TimeUnit.SECONDS);
    }
    private static long budget(Duration value, long maximum) {
        long ms = value.toMillis();
        if (ms < 50 || ms > maximum) throw new IllegalArgumentException("MQTT budget must be 50.." + maximum + " ms");
        return ms;
    }
    long timeoutFor(String path, boolean safety) {
        if (safety) return safetyTimeoutMs;
        if (path.equals("/capture")) return captureTimeoutMs;
        if (path.equals("/control-session") || path.equals("/servo-session")) return acquisitionTimeoutMs;
        if (path.equals("/status")) return statusTimeoutMs;
        return timeoutMs;
    }
    public boolean enabled() { return client != null; }
    void receive(String topic, MqttMessage message) {
        if (message.isRetained() || message.getPayload().length > 8192) return;
        String[] parts = topic.split("/");
        if (parts.length != 4 || !Set.of("movement", "sensor").contains(parts[2])) return;
        String role = parts[2];
        try {
            var value = JSON.readTree(message.getPayload());
            if (parts[3].equals("state")) {
                String connection = value.path("connectionId").asString("");
                if (!value.path("online").asBoolean(false) || !connection.matches("[0-9a-f]{32}")) {
                    presence.remove(role); failRole(role); return;
                }
                var previous = presence.put(role, new Presence(connection, System.nanoTime()));
                if (previous != null && !previous.connection.equals(connection)) failRole(role);
            } else if (parts[3].equals("ack")) {
                String id = value.path("id").asString("");
                var item = pending.get(id);
                Presence current = presence.get(role);
                if (current != null && System.nanoTime() - current.seen <= 3_000_000_000L
                        && item != null && current.connection.equals(item.connection) && item.role.equals(role) && item.connection.equals(value.path("connectionId").asString("")))
                    item.future.complete(value);
            }
        } catch (RuntimeException ignored) { /* Malformed or unrelated traffic cannot acknowledge a command. */ }
    }
    private void failRole(String role) {
        pending.values().stream().filter(p -> p.role.equals(role)).forEach(p ->
                p.future.completeExceptionally(new SystemFailure(503, "device-disconnected", "ESP32 disconnected or restarted; acquire control again")));
    }
    private void failAll(String category, String message) {
        pending.values().forEach(p -> {
            var failure = new SystemFailure(503, category, message);
            p.future.completeExceptionally(failure); p.published.completeExceptionally(failure);
        });
    }
    static void releaseAfterSettlement(CompletableFuture<?> response, CompletableFuture<?> publication, Runnable release) {
        CompletableFuture.allOf(response, publication).whenComplete((ignored, error) -> release.run());
    }
    public CompletableFuture<JsonNode> request(String role, String method, String path, byte[] body) {
        if (client == null || !client.isConnected() || !subscribed)
            return CompletableFuture.failedFuture(new SystemFailure(503, "broker-disconnected", "MQTT broker unavailable"));
        Presence device = presence.get(role);
        if (device == null || System.nanoTime() - device.seen > 3_000_000_000L)
            return CompletableFuture.failedFuture(new SystemFailure(503, "device-disconnected", "ESP32 presence unavailable"));
        // Reserve safety capacity; bound memory even if callers flood normal requests.
        boolean safety = new String(body, java.nio.charset.StandardCharsets.UTF_8).matches("(?s).*\"command\"\\s*:\\s*\"(STOP|HOLD)\".*");
        Semaphore slots = safety ? safetySlots : normalSlots;
        if (!slots.tryAcquire())
            return CompletableFuture.failedFuture(new SystemFailure(503, "mqtt-busy", "MQTT request capacity exceeded"));
        String id = UUID.randomUUID().toString();
        var result = new CompletableFuture<JsonNode>();
        var published = new CompletableFuture<Void>();
        pending.put(id, new Pending(role, device.connection, result, published));
        // An ACK deadline does not remove a packet queued inside Paho. Retain its
        // permit until publication settles too, bounding the library's outbound queue.
        releaseAfterSettlement(result, published, () -> { pending.remove(id); slots.release(); });
        // CompletableFuture uses its own deadline scheduler; reconnect attempts cannot delay expiration.
        result.orTimeout(timeoutFor(method.equals("GET") && path.equals("/servo") ? "/status" : path, safety), TimeUnit.MILLISECONDS);
        long started = System.nanoTime();
        result.whenComplete((ack, error) -> {
            LOG.debug("metric=mqtt-ack elapsedMs={} success={} role={}", (System.nanoTime()-started)/1_000_000.0, error == null, role);
        });
        try {
            byte[] payload = JSON.writeValueAsBytes(Map.of("id", id, "connectionId", device.connection,
                    "method", method, "path", path, "body", body.length == 0 ? Map.of() : JSON.readTree(body)));
            client.publish("plant/v1/" + role + (safety ? "/urgent" : "/command"), payload, 0, false, null,
                    new IMqttActionListener() {
                        public void onSuccess(IMqttToken token) { published.complete(null); }
                        public void onFailure(IMqttToken token, Throwable e) {
                            var failure = new SystemFailure(503, "broker-disconnected", "MQTT publication failed");
                            published.completeExceptionally(failure); result.completeExceptionally(failure);
                        }
                    });
        } catch (Exception e) { published.completeExceptionally(e); result.completeExceptionally(e); }
        return result;
    }
    /** Compatibility boundary for existing services. Publication and correlation are asynchronous;
     * the HTTP request waits only for the bounded device ACK, without a global transport lock. */
    public ClientHttpResponse exchange(String role, String method, String path, byte[] body) {
        JsonNode ack;
        try { ack = request(role, method, path, body).join(); }
        catch (CompletionException e) {
            if (e.getCause() instanceof SystemFailure failure) throw failure;
            throw new SystemFailure(504, "device-ack-timeout", "No ESP32 execution ACK; control state is unconfirmed");
        }
        int status = ack.path("status").asInt(0);
        if (status < 200 || status > 599 || !ack.path("body").isObject())
            throw new SystemFailure(502, "device-response", "Invalid MQTT acknowledgement");
        byte[] bytes = JSON.writeValueAsBytes(ack.get("body"));
        return new ClientHttpResponse() {
            public HttpStatusCode getStatusCode() { return HttpStatusCode.valueOf(status); }
            public String getStatusText() { return "ESP32 ACK"; }
            public HttpHeaders getHeaders() { var h = new HttpHeaders(); h.setContentType(MediaType.APPLICATION_JSON); return h; }
            public InputStream getBody() { return new ByteArrayInputStream(bytes); }
            public void close() {}
        };
    }
    @PreDestroy public void close() {
        clock.shutdownNow(); failAll("broker-disconnected", "Backend shutting down"); presence.clear();
        if (client != null) try { client.disconnectForcibly(0, 0, false); client.close(true); } catch (MqttException ignored) {}
    }
}
