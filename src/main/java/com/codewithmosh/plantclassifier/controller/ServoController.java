package com.codewithmosh.plantclassifier.controller;
import com.codewithmosh.plantclassifier.dto.*;
import com.codewithmosh.plantclassifier.service.ServoService;
import jakarta.servlet.http.HttpSession;
import jakarta.servlet.http.HttpServletResponse;
import java.util.function.Supplier;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/sensor-servo")
public class ServoController {
    private final ServoService service;
    public ServoController(ServoService service) { this.service = service; }
    private ServoStatus timed(HttpServletResponse response, Supplier<ServoStatus> action) {
        long started = System.nanoTime();
        try { return action.get(); }
        finally { response.setHeader("Server-Timing", "servo;dur=" + ((System.nanoTime()-started)/1_000_000.0)); }
    }
    @GetMapping public ServoStatus status(HttpServletResponse response) { return timed(response, service::status); }
    @PostMapping("/session") public ServoStatus acquire(HttpSession session, HttpServletResponse response) { return timed(response, () -> service.acquire(session.getId())); }
    @PostMapping public ServoStatus command(@Valid @RequestBody ServoRequest request, HttpSession session, HttpServletResponse response) { return timed(response, () -> service.command(request,session.getId())); }
}
