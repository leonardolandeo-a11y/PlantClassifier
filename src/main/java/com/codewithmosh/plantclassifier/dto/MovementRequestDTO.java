package com.codewithmosh.plantclassifier.dto;

import jakarta.validation.constraints.*;

public record MovementRequestDTO(
        @NotBlank @Pattern(regexp = "(?i)(FORWARD|BACKWARD|LEFT|RIGHT|CENTER|STOP)") String command,
        @NotNull @Min(0) @Max(255) Integer speed,
        @NotBlank @Pattern(regexp = "[0-9a-f]{32}") String sessionId,
        @NotNull @Min(1) @Max(2147483647) Long sequence) {
    public MovementRequestDTO {
        if (command != null) command = command.toUpperCase(java.util.Locale.ROOT);
    }
}
