package com.codewithmosh.plantclassifier.service;

import com.codewithmosh.plantclassifier.exception.SystemFailure;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Bounded JSON reader for small, authenticated device responses. Redirects are never accepted. */
final class DeviceResponse {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private DeviceResponse() {}
    static JsonNode read(RestClient.RequestHeadersSpec<?> request) {
        return read(request, false);
    }
    static JsonNode readMovement(RestClient.RequestHeadersSpec<?> request) {
        return read(request, true);
    }
    private static JsonNode read(RestClient.RequestHeadersSpec<?> request, boolean movement) {
        return request.exchange((req, response) -> {
            int status = response.getStatusCode().value();
            if (movement && status == 409) {
                byte[] body = response.getBody().readNBytes(8193);
                if (body.length <= 8192) {
                    try {
                        var error = JSON.readTree(body);
                        if (error != null && error.path("error").asString("").startsWith("Reversal interlock:"))
                            throw new SystemFailure(409, "reversal-interlock",
                                    "Cambio de sentido rechazado: suelta las teclas, espera al menos 500 ms y a que el motor se detenga, y vuelve a pulsar.");
                    } catch (tools.jackson.core.JacksonException ignored) { /* Generic rejection below. */ }
                }
            }
            if (status == 409) throw new SystemFailure(409,"device-rejected","Device rejected stale or expired control");
            if (!response.getStatusCode().is2xxSuccessful())
                throw new SystemFailure(502,"device-communication","Device rejected the request");
            byte[] bytes = response.getBody().readNBytes(8193);
            if (bytes.length == 0 || bytes.length > 8192) throw invalid();
            try {
                JsonNode node = JSON.readTree(bytes);
                if (node == null || !node.isObject()) throw invalid();
                return node;
            } catch (tools.jackson.core.JacksonException ex) { throw invalid(); }
        });
    }
    static SystemFailure invalid() { return new SystemFailure(502,"device-response","Device returned invalid JSON or fields"); }
    static double number(JsonNode node, String name) {
        var value=node.get(name);
        if(value==null || !value.isNumber() || !Double.isFinite(value.doubleValue())) throw invalid();
        return value.doubleValue();
    }
    static long integer(JsonNode node, String name) {
        var value=node.get(name);
        if(value==null || !value.isIntegralNumber() || !value.canConvertToLong()) throw invalid();
        return value.longValue();
    }
    static String text(JsonNode node, String name) {
        var value=node.get(name);
        if(value==null || !value.isString()) throw invalid();
        return value.asString();
    }
    static boolean bool(JsonNode node, String name) {
        var value=node.get(name);
        if(value==null || !value.isBoolean()) throw invalid();
        return value.booleanValue();
    }
}
