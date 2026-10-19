package com.codewithmosh.plantclassifier.controller;

import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.Map;

@RestController
public class SessionController {
    @GetMapping("/session")
    public Map<String, Object> session(java.security.Principal principal) {
        return Map.of("authenticated", principal != null, "username", principal == null ? "" : principal.getName());
    }
    @GetMapping("/csrf")
    public Map<String, String> csrf(CsrfToken token) {
        return Map.of("headerName", token.getHeaderName(), "token", token.getToken());
    }
}
