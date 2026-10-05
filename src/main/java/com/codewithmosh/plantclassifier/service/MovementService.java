package com.codewithmosh.plantclassifier.service;

import com.codewithmosh.plantclassifier.dto.MovementRequestDTO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class MovementService {

    @Value("${movement.esp32.url}")
    private String esp32Url;

    public void sendCommand(MovementRequestDTO request) {

        RestClient restClient = RestClient.create();

        restClient.post()
                .uri(esp32Url + "/movement")
                .body(request)
                .retrieve()
                .toBodilessEntity();
    }
}
