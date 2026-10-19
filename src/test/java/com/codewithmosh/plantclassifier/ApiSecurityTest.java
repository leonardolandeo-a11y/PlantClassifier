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
    @Test void unauthorizedAndCsrfFailuresAreStructured() throws Exception {
        mvc.perform(post("/movement")).andExpect(status().isUnauthorized()).andExpect(content().contentTypeCompatibleWith("application/problem+json"));
        mvc.perform(post("/movement").with(user("operator").roles("OPERATOR")))
                .andExpect(status().isForbidden());
        mvc.perform(post("/movement/session").with(user("reader").roles("VIEWER")).with(csrf()))
                .andExpect(status().isForbidden());
        verifyNoInteractions(movement);
    }
    @Test void authorizedSessionAcquisitionWorks() throws Exception {
        when(movement.acquire(any())).thenReturn(new MovementService.ControlSession("a".repeat(32),0L));
        mvc.perform(post("/movement/session").with(user("operator").roles("OPERATOR")).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.sessionId").value("a".repeat(32)));
    }
    @Test void invalidJsonFieldsAndNumbersAreRejected() throws Exception {
        for(String body:new String[]{"{", "{}", "{\"command\":\"BAD\",\"speed\":100}",
                "{\"command\":\"STOP\",\"speed\":1.2,\"sessionId\":\""+"a".repeat(32)+"\",\"sequence\":1}",
                "{\"command\":\"STOP\",\"speed\":\"100\",\"sessionId\":\""+"a".repeat(32)+"\",\"sequence\":1}"})
            mvc.perform(post("/movement").with(user("operator").roles("OPERATOR")).with(csrf()).contentType("application/json").content(body))
                    .andExpect(status().isBadRequest());
        verifyNoInteractions(movement);
    }
    @Test void timeoutIs504WithoutPrivateDeviceDetails() throws Exception {
        when(movement.acquire(any())).thenThrow(new ResourceAccessException("private device address",new HttpTimeoutException("timeout")));
        mvc.perform(post("/movement/session").with(user("operator").roles("OPERATOR")).with(csrf()))
                .andExpect(status().isGatewayTimeout()).andExpect(jsonPath("$.type").value("urn:plantclassifier:device-timeout"));
    }
    @Test void csrfEndpointSupportsSessionLogin() throws Exception {
        mvc.perform(get("/csrf")).andExpect(status().isOk()).andExpect(jsonPath("$.token").isNotEmpty());
    }
    @Test void loginCreatesAnAuthenticatedBrowserSession() throws Exception {
        var login=mvc.perform(post("/login").with(csrf()).param("username","test-operator")
                .param("password","local-test-password-only"))
                .andExpect(status().is3xxRedirection()).andReturn();
        var session=(org.springframework.mock.web.MockHttpSession)login.getRequest().getSession(false);
        assert session != null;
        when(movement.acquire(any())).thenReturn(new MovementService.ControlSession("a".repeat(32),0L));
        mvc.perform(post("/movement/session").session(session).with(csrf())).andExpect(status().isOk());
    }
    @Test void unsupportedMethodsKeepTheirHttpStatus() throws Exception {
        mvc.perform(get("/movement").with(user("operator").roles("OPERATOR")))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
    }
    @Test void loginPageIsDarkAndContainsRealCsrfForm() throws Exception {
        mvc.perform(get("/login")).andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("text/html"))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("name=\"_csrf\"")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("/css/output.css")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("action=\"/login\"")));
    }
    @Test void invalidCredentialsAndMissingCsrfCannotLogin() throws Exception {
        mvc.perform(post("/login").with(csrf()).param("username","test-operator").param("password","incorrect"))
                .andExpect(redirectedUrl("/login?error"));
        mvc.perform(post("/login").param("username","test-operator").param("password","local-test-password-only"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/login?error")).andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("Invalid username or password")));
        mvc.perform(get("/session")).andExpect(jsonPath("$.authenticated").value(false));
    }
    @Test void loginRotatesSessionAndLogoutInvalidatesIt() throws Exception {
        var anonymous = new org.springframework.mock.web.MockHttpSession();
        String oldId = anonymous.getId();
        var login = mvc.perform(post("/login").session(anonymous).with(csrf()).param("username","test-operator")
                .param("password","local-test-password-only")).andExpect(redirectedUrl("/")).andReturn();
        var session = (org.springframework.mock.web.MockHttpSession) login.getRequest().getSession(false);
        org.junit.jupiter.api.Assertions.assertNotEquals(oldId, session.getId());
        mvc.perform(get("/session").session(session)).andExpect(jsonPath("$.authenticated").value(true))
                .andExpect(jsonPath("$.username").value("test-operator"));
        mvc.perform(post("/logout").session(session)).andExpect(status().isForbidden());
        String owner = session.getId();
        mvc.perform(post("/logout").session(session).with(csrf())).andExpect(redirectedUrl("/"));
        org.junit.jupiter.api.Assertions.assertTrue(session.isInvalid());
        verify(movement).release(owner);
        mvc.perform(post("/sensors/capture").with(csrf())).andExpect(status().isUnauthorized());
    }
    @Test void publicDashboardAssetsAndProtectedReadStatus() throws Exception {
        mvc.perform(get("/")).andExpect(status().isOk());
        mvc.perform(get("/js/scripts.js")).andExpect(status().isOk());
        mvc.perform(get("/sensors")).andExpect(status().isUnauthorized());
    }

}
