package com.codewithmosh.plantclassifier;

import com.codewithmosh.plantclassifier.config.DeviceClients;
import com.codewithmosh.plantclassifier.dto.MovementRequestDTO;
import com.codewithmosh.plantclassifier.service.MovementService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

/** Opt-in timing against a verified software device, never a physical controller. */
@EnabledIfEnvironmentVariable(named="PLANT_BENCHMARK_OUTPUT", matches=".+")
class MovementLatencyTest {
    @Test void measureServiceRoundTrip() throws Exception {
        String url=System.getenv("PLANT_DEVICE_URL"), token=System.getenv("DEVICE_TOKEN");
        var response=HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create(url+"/status"))
                .header("X-Device-Token",token).build(),HttpResponse.BodyHandlers.ofString());
        var status=JsonMapper.builder().build().readTree(response.body());
        assertEquals(200,response.statusCode());
        assertEquals("simulation",status.get("mode").asString());
        assertFalse(status.get("hardwareOutputEnabled").booleanValue());
        var service=new MovementService(DeviceClients.client(url,token,Duration.ofMillis(300),Duration.ofMillis(500)));
        Map<String,List<Double>> samples=new LinkedHashMap<>();
        for(int i=0;i<110;i++) {
            long start=System.nanoTime();
            var session=service.acquire("benchmark");
            add(samples,"session",start,i);
            long sequence=0;
            for(String command:List.of("FORWARD","LEFT","RIGHT","BACKWARD","STOP")) {
                start=System.nanoTime();
                service.sendCommand(new MovementRequestDTO(command,
                        command.equals("FORWARD") || command.equals("BACKWARD") ? 150 : 0,
                        session.sessionId(),++sequence),"benchmark");
                add(samples,command,start,i);
            }
        }
        samples.forEach((name,values)->{
            values.sort(Double::compare);
            System.out.printf(Locale.ROOT,"LATENCY service %s n=%d mean=%.3f median=%.3f p95=%.3f max=%.3f ms%n",
                    name,values.size(),values.stream().mapToDouble(Double::doubleValue).average().orElseThrow(),
                    (values.get(49)+values.get(50))/2,values.get(94),values.get(99));
        });
    }
    private static void add(Map<String,List<Double>> samples,String name,long start,int iteration) {
        double ms=(System.nanoTime()-start)/1_000_000.0;
        if(iteration>=10) samples.computeIfAbsent(name,k->new ArrayList<>()).add(ms);
    }
}
