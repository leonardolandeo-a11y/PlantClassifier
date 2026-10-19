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
    public record ControlSession(String sessionId, Long deviceTimeMs) {}
    private static final tools.jackson.databind.json.JsonMapper JSON = tools.jackson.databind.json.JsonMapper.builder().build();
    private final RestClient client;
    private ControlSession active;
    private String owner;
    private long originNanos;
    private long sequence;
    private long lastAccepted;

    public MovementService(@Qualifier("movementClient") RestClient client) { this.client = client; }

    // Session acquisition is serialized. The device stops and rotates its epoch on every acquisition.
    public synchronized ControlSession acquire(String owner) {
        active = null;
        var json = DeviceResponse.read(client.post().uri("/control-session"));
        var session = new ControlSession(DeviceResponse.text(json, "sessionId"), DeviceResponse.integer(json, "deviceTimeMs"));
        if (session == null || session.sessionId() == null || !session.sessionId().matches("[0-9a-f]{32}")
                || session.deviceTimeMs() == null || session.deviceTimeMs() < 0 || session.deviceTimeMs() > 0xffffffffL) {
            throw new SystemFailure(502, "device-response", "Invalid controller session response");
        }
        this.active = session;
        this.owner = owner;
        this.originNanos = System.nanoTime(); // Conservative: response transit consumes device lifetime.
        this.sequence = 0;
        this.lastAccepted = System.nanoTime();
        return session;
    }

    /** Logout closes the owner's device epoch, even when a browser has lost its local state. */
    public void release(String owner) {
        MovementRequestDTO stop;
        synchronized (this) {
            if (active == null || !Objects.equals(this.owner, owner)) return;
            stop = new MovementRequestDTO("STOP", 0, active.sessionId(), sequence + 1);
        }
        try { sendCommand(stop, owner); }
        catch (RuntimeException ex) {
            // Authentication logout must always complete. Firmware's independent watchdog remains active.
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
            if (request.command().equals("STOP")) active = null;
        }
        // No network lock: STOP can overtake an in-flight command; firmware enforces epoch + sequence.
        byte[] payload = JSON.writeValueAsBytes(Map.of(
                "command", request.command(), "speed", request.speed(), "sessionId", request.sessionId(),
                "sequence", request.sequence(), "deadlineMs", deadline));
        // ESP32 WebServer expects a bounded request body with Content-Length, not chunked streaming.
        var json = DeviceResponse.read(client.post().uri("/movement")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .contentLength(payload.length).body(payload));
        long speed = DeviceResponse.integer(json, "speed");
        if (speed < 0 || speed > 255) throw DeviceResponse.invalid();
        var ack = new MovementAck(DeviceResponse.text(json, "status"), DeviceResponse.text(json, "command"),
                (int) speed, DeviceResponse.bool(json, "simulated"), DeviceResponse.text(json, "sessionId"),
                DeviceResponse.integer(json, "sequence"));
        if (ack == null || !"OK".equals(ack.status()) || !request.command().equals(ack.command())
                || !request.sessionId().equals(ack.sessionId()) || !request.sequence().equals(ack.sequence())
                || ack.speed() == null || ack.speed() < 0 || ack.speed() > 255 || ack.simulated() == null) {
            throw new SystemFailure(502, "device-response", "Invalid device acknowledgement");
        }
        return ack;
    }
}
