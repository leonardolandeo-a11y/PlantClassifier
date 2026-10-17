package com.codewithmosh.plantclassifier.service;

import com.codewithmosh.plantclassifier.dto.MovementRequestDTO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class MovementService {
    private static final Logger logger = LoggerFactory.getLogger(MovementService.class);
    private final RestClient restClient;

    public MovementService(
            @Value("${movement.esp32.url}") String esp32Url
    ) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(2));
        requestFactory.setReadTimeout(Duration.ofSeconds(5));
        this.restClient = RestClient.builder().baseUrl(esp32Url).requestFactory(requestFactory).build();
    }

    public void sendCommand(MovementRequestDTO request) {

        logger.debug("Sending robot movement command {}", request.getCommand());
        restClient.post()
                .uri("/movement")
                .contentType(MediaType.APPLICATION_JSON)
                .body(request)
                .retrieve()
                .toBodilessEntity();
    }
}
