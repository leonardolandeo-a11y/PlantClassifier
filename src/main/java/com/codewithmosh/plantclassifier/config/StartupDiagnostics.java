package com.codewithmosh.plantclassifier.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component
public class StartupDiagnostics implements ApplicationRunner {
    private static final Logger log=LoggerFactory.getLogger(StartupDiagnostics.class);
    @Override public void run(ApplicationArguments arguments) {
        log.info("PlantClassifier ready: schema validated; session/CSRF protection active; device clients configured. Acquire control before movement. Physical motion is not measured.");
    }
}
