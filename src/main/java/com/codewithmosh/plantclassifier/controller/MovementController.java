package com.codewithmosh.plantclassifier.controller;

import com.codewithmosh.plantclassifier.dto.MovementRequestDTO;
import com.codewithmosh.plantclassifier.service.MovementService;
import jakarta.validation.Valid;
import lombok.AllArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/movement")
@AllArgsConstructor
public class MovementController {
    private final MovementService movementService;

    @PostMapping
    public ResponseEntity<Void> move(@Valid @RequestBody MovementRequestDTO request) {
        movementService.sendCommand(request);
        return ResponseEntity.ok().build();
    }
}
