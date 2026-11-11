package com.codewithmosh.plantclassifier.controller;
import com.codewithmosh.plantclassifier.dto.*;
import com.codewithmosh.plantclassifier.service.ServoService;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/sensor-servo")
public class ServoController {
    private final ServoService service;
    public ServoController(ServoService service) { this.service = service; }
    @GetMapping public ServoStatus status() { return service.status(); }
    @PostMapping("/session") public ServoStatus acquire(HttpSession session) { return service.acquire(session.getId()); }
    @PostMapping public ServoStatus command(@Valid @RequestBody ServoRequest request, HttpSession session) { return service.command(request,session.getId()); }
}
