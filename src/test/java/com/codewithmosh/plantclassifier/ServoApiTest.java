package com.codewithmosh.plantclassifier;
import com.codewithmosh.plantclassifier.service.ServoService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.mockito.Mockito.*;
@SpringBootTest @ActiveProfiles("test")
class ServoApiTest {
    @Autowired WebApplicationContext context;
    @MockitoBean ServoService servo;
    @Test void csrfAndValidationProtectServoEndpoints() throws Exception {
        var mvc=MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        mvc.perform(post("/sensor-servo")).andExpect(status().isForbidden());
        mvc.perform(post("/sensor-servo/session")).andExpect(status().isForbidden());
        mvc.perform(post("/sensor-servo").with(csrf()).contentType("application/json")
            .content("{\"command\":\"FORWARD\",\"epoch\":1,\"sequence\":1}")).andExpect(status().isBadRequest());
        verifyNoInteractions(servo);
        mvc.perform(post("/sensor-servo").with(csrf()).contentType("application/json")
            .content("{\"command\":\"HOLD\",\"epoch\":1,\"sequence\":1}")).andExpect(status().isOk());
        verify(servo).command(any(),anyString());
    }
}
