package com.codewithmosh.plantclassifier.controller;

import com.codewithmosh.plantclassifier.dto.CaptureResponse;
import com.codewithmosh.plantclassifier.service.SensorDataService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/sensors")
public class SensorDataController {
    private final SensorDataService service;
    public SensorDataController(SensorDataService service) { this.service = service; }
    @GetMapping
    public ResponseEntity<CaptureResponse> latest() {
        return service.getLatestSensorData().map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
    }
    @PostMapping("/capture")
    public CaptureResponse capture() { return service.captureData(); }
}
