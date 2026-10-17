package com.codewithmosh.plantclassifier;

import com.codewithmosh.plantclassifier.dto.MovementRequestDTO;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class MovementRequestDTOTest {
    @Test void validatesAllCommandsBoundsAndMissingFields() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            String id = "a".repeat(32);
            for (String command : new String[]{"forward", "BACKWARD", "LEFT", "RIGHT", "CENTER", "STOP"}) {
                for (int speed : new int[]{0,255}) assertTrue(validator.validate(new MovementRequestDTO(command,speed,id,1L)).isEmpty());
            }
            assertEquals("FORWARD",new MovementRequestDTO("forward",0,id,1L).command());
            for (var request : new MovementRequestDTO[]{
                    new MovementRequestDTO("BAD",150,id,1L),new MovementRequestDTO("STOP",-1,id,1L),
                    new MovementRequestDTO("STOP",256,id,1L),new MovementRequestDTO(null,null,null,null),
                    new MovementRequestDTO("STOP",0,id,0L)}) assertFalse(validator.validate(request).isEmpty());
        }
    }
}
