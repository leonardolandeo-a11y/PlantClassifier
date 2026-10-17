package com.codewithmosh.plantclassifier.service;

import com.codewithmosh.plantclassifier.dto.MovementRequestDTO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class MovementService {
    private final RestClient restClient;

    public MovementService(
            @Value("${movement.esp32.url}") String esp32Url
    ) {
        System.out.println("ESP32 URL: " + esp32Url);

        this.restClient = RestClient.builder()
                .baseUrl(esp32Url)
                .build();
    }

    public void sendCommand(MovementRequestDTO request) {

        try {

            System.out.println(
                    "Sending command: " + request.getCommand()
            );

            System.out.println(
                    "Speed: " + request.getSpeed()
            );

            restClient.post()
                    .uri("/movement")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(request)
                    .retrieve()
                    .toBodilessEntity();

            System.out.println("Command sent successfully!");

        } catch (RuntimeException e) {

            System.err.println("MOVEMENT ERROR:");
            e.printStackTrace();

            throw e;
        }
    }
}