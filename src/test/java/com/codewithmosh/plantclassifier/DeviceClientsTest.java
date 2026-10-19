package com.codewithmosh.plantclassifier;

import com.codewithmosh.plantclassifier.config.DeviceClients;
import org.junit.jupiter.api.Test;
import java.time.Duration;
import static org.junit.jupiter.api.Assertions.*;

class DeviceClientsTest {
    @Test void malformedOriginsFailBeforeMakingRequests() {
        for (String url : new String[]{"http://http://192.168.1.10", "192.168.1.10", "ftp://sensor",
                "http://user:password@sensor", "http://sensor/capture", "http://sensor?token=x", "http://sensor#x"}) {
            assertThrows(IllegalArgumentException.class, () -> DeviceClients.client(url,
                    "test-token-with-at-least-32-characters", Duration.ofSeconds(1), Duration.ofSeconds(1)), url);
        }
    }
}
