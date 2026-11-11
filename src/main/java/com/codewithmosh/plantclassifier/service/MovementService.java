package com.codewithmosh.plantclassifier.service;

import com.codewithmosh.plantclassifier.dto.*;
import com.codewithmosh.plantclassifier.exception.SystemFailure;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import java.util.Map;
import java.util.Objects;

@Service
public class MovementService {
    public record ControlSession(String sessionId, long deviceTimeMs, long protocolVersion) {}
    private static final tools.jackson.databind.json.JsonMapper JSON = tools.jackson.databind.json.JsonMapper.builder().build();
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(MovementService.class);
    private final RestClient client;

    // Opt-in DEBUG timings exclude tokens, URLs and session identifiers.
    private tools.jackson.databind.JsonNode timedRead(String operation, RestClient.RequestHeadersSpec<?> request) {
        long started = System.nanoTime();
        boolean accepted = false;
        try {
            var result = DeviceResponse.readMovement(request);
            accepted = true;
            return result;
        } finally {
            LOG.debug("Movement HTTP operation={} responseOk={} elapsedMs={}", operation, accepted,
                    (System.nanoTime() - started) / 1_000_000.0);
        }
    }
    private final java.util.concurrent.atomic.AtomicBoolean acquiring = new java.util.concurrent.atomic.AtomicBoolean();
    private boolean combinedSupported;
    private ControlSession active;
    private String owner;
    private long originNanos;
    private long sequence;
    private long lastAccepted;
    private long controlRevision;

    public MovementService(@Qualifier("movementClient") RestClient client) { this.client = client; }

    // Only acquisitions are serialized. No network call holds the state monitor needed by STOP.
    public ControlSession acquire(String owner) {
        if (!acquiring.compareAndSet(false, true))
            throw new SystemFailure(409, "controller-busy", "Control acquisition already pending");
        final long revision;
        synchronized (this) { revision = controlRevision; }
        try {
            var json = timedRead("acquire", client.post().uri("/control-session"));
            var session = new ControlSession(DeviceResponse.text(json, "sessionId"), DeviceResponse.integer(json, "deviceTimeMs"),
                    json.has("protocolVersion") ? DeviceResponse.integer(json, "protocolVersion") : 1);
            if (!session.sessionId().matches("[0-9a-f]{32}")
                    || session.deviceTimeMs() < 0 || session.deviceTimeMs() > 0xffffffffL)
                throw new SystemFailure(502, "device-response", "Invalid controller session response");
            synchronized (this) {
                if (revision == controlRevision) {
                    combinedSupported = session.protocolVersion() == 2;
                    active = session; this.owner = owner;
                    originNanos = System.nanoTime(); sequence = 0; lastAccepted = originNanos;
                    return session;
                }
            }
            // STOP overtook acquisition. Close its late epoch without making it available to callers.
            byte[] body = JSON.writeValueAsBytes(Map.of("command", "STOP", "speed", 0,
                    "sessionId", session.sessionId(), "sequence", 1, "deadlineMs", 0));
            try { timedRead("cancel-acquire", client.post().uri("/movement")
                    .contentType(org.springframework.http.MediaType.APPLICATION_JSON).contentLength(body.length).body(body)); }
            catch (RuntimeException ignored) { /* Unconfirmed close: independent device watchdog still applies. */ }
            throw new SystemFailure(409, "acquisition-cancelled", "STOP cancelled pending acquisition; press again");
        } catch (RuntimeException error) {
            synchronized (this) { active = null; }
            throw error;
        } finally { acquiring.set(false); }
    }

    /** Release closes the owner's device epoch, even when a browser has lost its local state. */
    public void release(String owner) {
        MovementRequestDTO stop;
        synchronized (this) {
            if (active == null || !Objects.equals(this.owner, owner)) return;
            stop = new MovementRequestDTO("STOP", 0, active.sessionId(), sequence + 1);
        }
        try { sendCommand(stop, owner); }
        catch (RuntimeException ex) {
            // Release must always complete. Firmware's independent watchdog remains active.
            synchronized (this) { if (Objects.equals(this.owner, owner)) active = null; }
        }
    }

    public MovementAck sendCommand(MovementRequestDTO request, String owner) {
        final long deadline;
        synchronized (this) {
            if (active == null || !Objects.equals(this.owner, owner)
                    || !active.sessionId().equals(request.sessionId())) {
                throw new SystemFailure(409, "controller-session", "Acquire control before sending commands");
            }
            if (request.steering() != null && !request.command().equals("STOP") && !combinedSupported) {
                throw new SystemFailure(409, "protocol-version", "Firmware protocol v2 required for combined control");
            }
            if (request.sequence() <= sequence) {
                throw new SystemFailure(409, "stale-command", "Stale or duplicate command rejected");
            }
            long now = System.nanoTime();
            if (!request.command().equals("STOP") && now - lastAccepted > 1_500_000_000L) {
                active = null;
                throw new SystemFailure(409, "expired-control", "Control expired; acquire a new session");
            }
            sequence = request.sequence();
            lastAccepted = now;
            // Firmware compares this against millis(), including uint32 rollover. No clock synchronization needed.
            deadline = (active.deviceTimeMs() + (now - originNanos) / 1_000_000 + 1000) & 0xffffffffL;
            if (request.command().equals("STOP")) { active = null; ++controlRevision; }
        }
        // No network lock: STOP can overtake an in-flight command; firmware enforces epoch + sequence.
        var fields = new java.util.HashMap<String, Object>(Map.of(
                "command", request.command(), "speed", request.speed(), "sessionId", request.sessionId(),
                "sequence", request.sequence(), "deadlineMs", deadline));
        if (request.steering() != null) fields.put("steering", request.steering());
        byte[] payload = JSON.writeValueAsBytes(fields);
        LOG.debug("Movement submitted command={} steering={} speed={} sequence={}", request.command(), request.steering(), request.speed(), request.sequence());
        // ESP32 WebServer expects a bounded request body with Content-Length, not chunked streaming.
        var json = timedRead(request.command(), client.post().uri("/movement")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .contentLength(payload.length).body(payload));
        long speed = DeviceResponse.integer(json, "speed");
        if (speed < 0 || speed > 255) throw DeviceResponse.invalid();
        var ack = new MovementAck(DeviceResponse.text(json, "status"), DeviceResponse.text(json, "command"),
                (int) speed, DeviceResponse.bool(json, "simulated"), DeviceResponse.text(json, "sessionId"),
                DeviceResponse.integer(json, "sequence"),
                request.steering() == null ? null : DeviceResponse.text(json, "steering"),
                request.steering() == null ? null : DeviceResponse.integer(json, "protocolVersion"));
        if (!"OK".equals(ack.status()) || !request.command().equals(ack.command())
                || (request.steering() != null && (!request.steering().equals(ack.steering()) || !Long.valueOf(2).equals(ack.protocolVersion())))
                || ack.speed() != ((request.command().equals("FORWARD") || request.command().equals("BACKWARD")) ? request.speed() : 0)
                || !request.sessionId().equals(ack.sessionId()) || !request.sequence().equals(ack.sequence())) {
            throw new SystemFailure(502, "device-response", "Invalid device acknowledgement");
        }
        LOG.debug("Movement accepted command={} steering={} speed={} protocol={}", ack.command(), ack.steering(), ack.speed(), ack.protocolVersion());
        return ack;
    }
}
