package com.codewithmosh.plantclassifier;

import com.codewithmosh.plantclassifier.dto.MovementRequestDTO;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MovementRequestDTOTest {
    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void acceptsSupportedCommandAndSpeedBounds() {
        assertTrue(validator.validate(new MovementRequestDTO("FORWARD", 0)).isEmpty());
        assertTrue(validator.validate(new MovementRequestDTO("STOP", 255)).isEmpty());
    }

    @Test
    void rejectsUnknownCommandAndOutOfRangeSpeed() {
        var violations = validator.validate(new MovementRequestDTO("FORWARD;STOP", 256));
        assertEquals(2, violations.size());
    }

    @Test
    void acceptsFirmwareCaseInsensitiveCommands() {
        assertTrue(validator.validate(new MovementRequestDTO("left", 100)).isEmpty());
    }
}
