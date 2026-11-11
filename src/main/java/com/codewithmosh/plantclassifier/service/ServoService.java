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
    private final RestClient client;
    private String owner;
    private long epoch, sequence, origin, deviceTime, lastCommand;
    private boolean active;
    public ServoService(@Qualifier("sensorClient") RestClient client) { this.client = client; }
    private ServoStatus read(RestClient.RequestHeadersSpec<?> request) {
        var json = DeviceResponse.read(request);
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
        origin = lastCommand = started; sequence = 0; active = true;
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
        byte[] body = tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsBytes(Map.of(
                "command",request.command(),"epoch",request.epoch(),"sequence",request.sequence(),"deadlineMs",deadline));
        var result = read(client.post().uri("/servo").contentType(org.springframework.http.MediaType.APPLICATION_JSON).contentLength(body.length).body(body));
        if (result.epoch() != request.epoch()) throw DeviceResponse.invalid();
        return result;
    }
}
