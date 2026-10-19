package com.codewithmosh.plantclassifier.controller;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.core.io.ClassPathResource;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.util.HtmlUtils;

/** A native HTML form; Spring Security still processes POST /login and rotates the session. */
@RestController
public class LoginController {
    private final String template;
    public LoginController() throws IOException {
        template = new ClassPathResource("templates/login.html").getContentAsString(StandardCharsets.UTF_8);
    }
    @GetMapping(value = "/login", produces = "text/html")
    public String login(CsrfToken csrf, @RequestParam java.util.Map<String, String> parameters) {
        return template.replace("{{csrfName}}", HtmlUtils.htmlEscape(csrf.getParameterName()))
                .replace("{{csrfToken}}", HtmlUtils.htmlEscape(csrf.getToken()))
                .replace("{{error}}", parameters.containsKey("error") ? "Invalid username or password. Try again." : "");
    }
}
