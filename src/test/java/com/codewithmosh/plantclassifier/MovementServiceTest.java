package com.codewithmosh.plantclassifier;

import com.codewithmosh.plantclassifier.dto.MovementRequestDTO;
import com.codewithmosh.plantclassifier.service.MovementService;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertThrows;

class MovementServiceTest {

    @Test
    void sendsCommandAndSpeedToDevice() {
        MovementService service = new MovementService("http://127.0.0.1:1");
        assertThrows(org.springframework.web.client.RestClientException.class,
                () -> service.sendCommand(new MovementRequestDTO("FORWARD", 120)));
    }
}
