package com.codewithmosh.plantclassifier.config;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
public class DeviceClients {
    @org.springframework.beans.factory.annotation.Autowired
    private com.codewithmosh.plantclassifier.mqtt.MqttDeviceTransport mqtt;
    private RestClient routed(RestClient http, String role) {
        return mqtt.enabled() ? http.mutate().requestInterceptor((request, body, execution) ->
                mqtt.exchange(role, request.getMethod().name(), request.getURI().getPath(), body)).build() : http;
    }
    public static RestClient client(String baseUrl, String token, Duration connect, Duration read) {
        URI uri = URI.create(baseUrl);
        if (!("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))
                || uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null
                || uri.getFragment() != null || !(uri.getPath().isEmpty() || uri.getPath().equals("/"))) {
            throw new IllegalArgumentException("Device URL must be an HTTP(S) origin without credentials");
        }
        if (token.length() < 32 || token.startsWith("REPLACE_") || token.contains("\n") || token.contains("\r")) {
            throw new IllegalArgumentException("Configure DEVICE_TOKEN with at least 32 characters");
        }
        if (connect.isNegative() || connect.isZero() || read.isNegative() || read.isZero()) {
            throw new IllegalArgumentException("Device timeouts must be positive");
        }
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1).connectTimeout(connect).followRedirects(HttpClient.Redirect.NEVER).build());
        factory.setReadTimeout(read);
        return RestClient.builder().baseUrl(baseUrl).requestFactory(factory)
                .defaultHeader("X-Device-Token", token).build();
    }
    @Bean("sensorClient")
    RestClient sensors(@Value("${esp32.url}") String url, @Value("${device.token}") String token,
                       @Value("${esp32.connect-timeout}") Duration connect,
                       @Value("${esp32.read-timeout}") Duration read) {
        return routed(client(url, token, connect, read), "sensor");
    }
    // Dedicated budget: obsolete servo commands must fail before the 1 s watchdog.
    // Capture requests retain their independent, longer sensor timeout.
    @Bean("servoClient")
    RestClient servo(@Value("${esp32.url}") String url, @Value("${device.token}") String token) {
        return routed(client(url, token, Duration.ofMillis(250), Duration.ofMillis(600)), "sensor");
    }
    @Bean("movementClient")
    RestClient movement(@Value("${movement.esp32.url}") String url, @Value("${device.token}") String token,
                        @Value("${movement.connect-timeout}") Duration connect,
                        @Value("${movement.read-timeout}") Duration read) {
        return routed(client(url, token, connect, read), "movement");
    }
}
