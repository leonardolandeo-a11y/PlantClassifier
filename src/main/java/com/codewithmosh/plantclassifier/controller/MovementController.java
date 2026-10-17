package com.codewithmosh.plantclassifier.controller;

import com.codewithmosh.plantclassifier.dto.*;
import com.codewithmosh.plantclassifier.service.MovementService;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/movement")
public class MovementController {
    private final MovementService service;
    public MovementController(MovementService service) { this.service = service; }
    @PostMapping("/session")
    public MovementService.ControlSession acquire(HttpSession session) { return service.acquire(session.getId()); }
    @PostMapping
    public MovementAck move(@Valid @RequestBody MovementRequestDTO request, HttpSession session) {
        return service.sendCommand(request, session.getId());
    }
}
