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
        return request.exchange((req, response) -> {
            int status = response.getStatusCode().value();
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
