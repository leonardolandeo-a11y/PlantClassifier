package com.codewithmosh.plantclassifier;

import com.codewithmosh.plantclassifier.service.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.client.ResourceAccessException;
import java.net.http.HttpTimeoutException;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @ActiveProfiles("test")
class ApiSecurityTest {
    @Autowired WebApplicationContext context;
    @MockitoBean MovementService movement;
    @MockitoBean SensorDataService sensors;
    MockMvc mvc;
    @BeforeEach void setup() { mvc=MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build(); }
    @Test void anonymousMutationsWithoutCsrfAreForbidden() throws Exception {
        for (String path : new String[]{"/movement", "/movement/session", "/sensors/capture"}) {
            mvc.perform(post(path)).andExpect(status().isForbidden())
                    .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
            mvc.perform(post(path).with(csrf().useInvalidToken())).andExpect(status().isForbidden());
        }
        verifyNoInteractions(movement, sensors);
    }
    @Test void anonymousSessionOwnsControlWithoutAuthentication() throws Exception {
        var response = mvc.perform(get("/csrf")).andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty()).andReturn();
        var session = (org.springframework.mock.web.MockHttpSession) response.getRequest().getSession(false);
        org.junit.jupiter.api.Assertions.assertNotNull(session);
        org.junit.jupiter.api.Assertions.assertNull(session.getAttribute("SPRING_SECURITY_CONTEXT"));
        var token = (org.springframework.security.web.csrf.CsrfToken) response.getRequest().getAttribute(
                org.springframework.security.web.csrf.CsrfToken.class.getName());
        when(movement.acquire(session.getId())).thenReturn(new MovementService.ControlSession("a".repeat(32),0L));
        mvc.perform(post("/movement/session").session(session).header(token.getHeaderName(), token.getToken()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.sessionId").value("a".repeat(32)));
        verify(movement).acquire(session.getId());
        for (String command : new String[]{"FORWARD", "BACKWARD", "LEFT", "RIGHT", "CENTER", "STOP"}) {
            mvc.perform(post("/movement").session(session).header(token.getHeaderName(), token.getToken())
                    .contentType("application/json").content("{\"command\":\"" + command
                            + "\",\"speed\":0,\"sessionId\":\"" + "a".repeat(32) + "\",\"sequence\":1}"))
                    .andExpect(status().isOk());
        }
        verify(movement, times(6)).sendCommand(any(), eq(session.getId()));
        mvc.perform(post("/sensors/capture").session(session).header(token.getHeaderName(), token.getToken()))
                .andExpect(status().isOk());
        verify(sensors).captureData();
        // A different anonymous browser cannot reuse this browser's CSRF token.
        mvc.perform(post("/movement/session").session(new org.springframework.mock.web.MockHttpSession())
                .header(token.getHeaderName(), token.getToken())).andExpect(status().isForbidden());
    }
    @Test void invalidJsonFieldsAndNumbersAreRejected() throws Exception {
        for(String body:new String[]{"{", "{}", "{\"command\":\"BAD\",\"speed\":100}",
                "{\"command\":\"STOP\",\"speed\":1.2,\"sessionId\":\""+"a".repeat(32)+"\",\"sequence\":1}",
                "{\"command\":\"STOP\",\"speed\":\"100\",\"sessionId\":\""+"a".repeat(32)+"\",\"sequence\":1}"})
            mvc.perform(post("/movement").with(csrf()).contentType("application/json").content(body))
                    .andExpect(status().isBadRequest());
        verifyNoInteractions(movement);
    }
    @Test void timeoutIs504WithoutPrivateDeviceDetails() throws Exception {
        when(movement.acquire(any())).thenThrow(new ResourceAccessException("private device address",new HttpTimeoutException("timeout")));
        mvc.perform(post("/movement/session").with(csrf()))
                .andExpect(status().isGatewayTimeout()).andExpect(jsonPath("$.type").value("urn:plantclassifier:device-timeout"));
    }
    @Test void unsupportedMethodsKeepTheirHttpStatus() throws Exception {
        mvc.perform(get("/movement"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
    }
    @Test void dashboardAndSensorReadAreAvailableWithoutLogin() throws Exception {
        mvc.perform(get("/")).andExpect(status().isOk());
        mvc.perform(get("/js/scripts.js")).andExpect(status().isOk());
        mvc.perform(get("/sensors")).andExpect(status().isNoContent());
        verify(sensors).getLatestSensorData();
        mvc.perform(get("/login")).andExpect(status().isNotFound());
        mvc.perform(get("/session")).andExpect(status().isNotFound());
        org.junit.jupiter.api.Assertions.assertTrue(context.getBeansOfType(
                org.springframework.security.core.userdetails.UserDetailsService.class).isEmpty());
    }
}
