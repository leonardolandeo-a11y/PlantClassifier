package com.codewithmosh.plantclassifier;

import com.codewithmosh.plantclassifier.exception.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.*;
import java.net.SocketTimeoutException;
import java.net.http.HttpTimeoutException;
import java.net.URI;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    static ProblemDetail problem(int status, String category, String message) {
        var detail = ProblemDetail.forStatusAndDetail(HttpStatusCode.valueOf(status), message);
        detail.setType(URI.create("urn:plantclassifier:" + category));
        return detail;
    }
    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class})
    ProblemDetail invalid(Exception ex) { return problem(400, "invalid-request", "Invalid request fields or JSON"); }
    @ExceptionHandler(SystemFailure.class)
    ProblemDetail failure(SystemFailure ex) { return problem(ex.status(), ex.category(), ex.getMessage()); }
    @ExceptionHandler(RestClientException.class)
    ProblemDetail device(RestClientException ex) {
        for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
            if (cause instanceof SocketTimeoutException || cause instanceof HttpTimeoutException) {
                return problem(504, "device-timeout", "Device request timed out; commanded state is unknown");
            }
        }
        if (ex instanceof HttpClientErrorException conflict && conflict.getStatusCode().value() == 409) {
            return problem(409, "device-rejected", "Device rejected stale or expired control; acquire a new session");
        }
        log.warn("Device communication failed: {}", ex.getClass().getSimpleName());
        return problem(502, "device-communication", "Device unreachable or request rejected");
    }
    @ExceptionHandler(DataAccessException.class)
    ProblemDetail database(DataAccessException ex) {
        log.error("Persistence failed: {}", ex.getClass().getSimpleName());
        return problem(503, "persistence", "Measurement could not be stored; retry when the database is available");
    }
    @ExceptionHandler(Exception.class)
    ProblemDetail unexpected(Exception ex) {
        if (ex instanceof org.springframework.web.ErrorResponse response) {
            return problem(response.getStatusCode().value(), "http-request", "Request could not be handled");
        }
        log.error("Unexpected request failure: {}", ex.getClass().getSimpleName());
        return problem(500, "internal", "The request could not be completed");
    }
}
