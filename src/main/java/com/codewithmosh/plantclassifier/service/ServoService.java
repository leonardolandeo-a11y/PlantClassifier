package com.codewithmosh.plantclassifier.service;
import com.codewithmosh.plantclassifier.dto.*;
import com.codewithmosh.plantclassifier.exception.SystemFailure;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import java.util.Map;
import java.util.Objects;
@Service
public class ServoService {
    private static final tools.jackson.databind.json.JsonMapper JSON = tools.jackson.databind.json.JsonMapper.builder().build();
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(ServoService.class);
    private final RestClient client;
    private String owner;
    private long epoch, sequence, origin, deviceTime, lastCommand;
    private boolean active;
    public ServoService(@Qualifier("servoClient") RestClient client) { this.client = client; }
    private ServoStatus read(RestClient.RequestHeadersSpec<?> request) {
        long started = System.nanoTime();
        tools.jackson.databind.JsonNode json;
        try { json = DeviceResponse.read(request); }
        finally { LOG.debug("Servo device round trip {} ms", (System.nanoTime() - started) / 1_000_000.0); }
        long angle = DeviceResponse.integer(json,"angle"), e = DeviceResponse.integer(json,"epoch"), time = DeviceResponse.integer(json,"deviceTimeMs");
        String state = DeviceResponse.text(json,"state");
        if (angle < 70 || angle > 130 || e < 0 || e > 0xffffffffL || time < 0 || time > 0xffffffffL ||
                !java.util.Set.of("holding","increasing","decreasing","centering","fault").contains(state)) throw DeviceResponse.invalid();
        return new ServoStatus((int)angle,state,e,time);
    }
    public ServoStatus status() { return read(client.get().uri("/servo")); }
    public synchronized ServoStatus acquire(String owner) {
        active = false;
        long started = System.nanoTime();
        var result = read(client.post().uri("/servo-session"));
        this.owner = owner; epoch = result.epoch(); deviceTime = result.deviceTimeMs();
        // Anchor at receipt, not send: counting acquisition RTT twice could put
        // deadlineMs > 1000 ms into the device's future and cause spurious 409s.
        origin = System.nanoTime(); lastCommand = started; sequence = 0; active = true;
        return result;
    }
    public ServoStatus command(ServoRequest request, String owner) {
        long deadline;
        synchronized(this) {
            long now = System.nanoTime();
            if (!active || !Objects.equals(this.owner,owner) || request.epoch() != epoch || request.sequence() <= sequence ||
                    (!request.command().equals("HOLD") && now-lastCommand >= 1_000_000_000L))
                throw new SystemFailure(409,"servo-session","Acquire servo control again");
            sequence = request.sequence(); lastCommand = now;
            deadline = (deviceTime + (now-origin)/1_000_000 + 750) & 0xffffffffL;
            if (request.command().equals("HOLD")) active = false;
        }
        byte[] body = JSON.writeValueAsBytes(Map.of(
                "command",request.command(),"epoch",request.epoch(),"sequence",request.sequence(),"deadlineMs",deadline));
        var result = read(client.post().uri("/servo").contentType(org.springframework.http.MediaType.APPLICATION_JSON).contentLength(body.length).body(body));
        if (result.epoch() != request.epoch()) throw DeviceResponse.invalid();
        return result;
    }
}
