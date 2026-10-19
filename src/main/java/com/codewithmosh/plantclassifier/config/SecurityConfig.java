package com.codewithmosh.plantclassifier.config;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {
    @Bean
    UserDetailsService users(@Value("${control.username}") String username,
                             @Value("${control.password}") String password) {
        if (username.isBlank() || password.length() < 12 || password.startsWith("REPLACE_")) {
            throw new IllegalArgumentException("Configure CONTROL_USERNAME and CONTROL_PASSWORD (at least 12 characters)");
        }
        return new InMemoryUserDetailsManager(User.withUsername(username)
                .password("{bcrypt}" + new BCryptPasswordEncoder().encode(password)).roles("OPERATOR").build());
    }

    public static void problem(HttpServletResponse response, int status) throws java.io.IOException {
        response.setStatus(status);
        response.setContentType("application/problem+json");
        response.getWriter().write("{\"type\":\"about:blank\",\"status\":" + status
                + ",\"title\":\"" + (status == 401 ? "Authentication required" : "Forbidden operation") + "\"}");
    }

    @Bean
    SecurityFilterChain security(HttpSecurity http, com.codewithmosh.plantclassifier.service.MovementService movement) throws Exception {
        http.authorizeHttpRequests(auth -> auth
                .requestMatchers("/", "/index.html", "/css/**", "/js/**", "/csrf", "/session", "/login", "/error").permitAll()
                .anyRequest().hasRole("OPERATOR"))
            .formLogin(form -> form.loginPage("/login").loginProcessingUrl("/login")
                    .failureUrl("/login?error").defaultSuccessUrl("/", true).permitAll())
            .requestCache(cache -> cache.disable())
            .logout(logout -> logout.addLogoutHandler((req, res, auth) -> {
                var session = req.getSession(false);
                if (session != null) movement.release(session.getId());
            }).invalidateHttpSession(true).clearAuthentication(true).deleteCookies("JSESSIONID").logoutSuccessUrl("/"))
            .exceptionHandling(errors -> errors
                .authenticationEntryPoint((req, res, ex) -> problem(res, 401))
                .accessDeniedHandler((req, res, ex) -> problem(res,
                        org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication() == null
                        || org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication() instanceof org.springframework.security.authentication.AnonymousAuthenticationToken ? 401 : 403)));
        // Session authentication and default CSRF protection apply to every mutation, including login.
        return http.build();
    }
}
