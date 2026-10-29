package com.codewithmosh.plantclassifier;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(exclude = org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration.class)
public class PlantClassifierApplication {

    public static void main(String[] args) {
        SpringApplication.run(PlantClassifierApplication.class, args);
    }

}
