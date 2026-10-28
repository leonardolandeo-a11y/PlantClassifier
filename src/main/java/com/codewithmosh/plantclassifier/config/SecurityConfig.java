package com.codewithmosh.plantclassifier.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {
    @Bean
    SecurityFilterChain security(HttpSecurity http) throws Exception {
        // Local dashboard: anonymous HTTP sessions still own control and CSRF tokens.
        // Default CSRF protection remains enabled for every mutation.
        http.authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
            .formLogin(form -> form.disable())
            .httpBasic(basic -> basic.disable())
            .logout(logout -> logout.disable())
            .requestCache(cache -> cache.disable())
            .exceptionHandling(errors -> errors.accessDeniedHandler((req, res, ex) -> {
                res.setStatus(403);
                res.setContentType("application/problem+json");
                res.getWriter().write("{\"type\":\"about:blank\",\"status\":403,\"title\":\"Forbidden operation\"}");
            }));
        return http.build();
    }
}
