package com.codewithmosh.plantclassifier.dto;

import jakarta.validation.constraints.*;

public record MovementRequestDTO(
        @NotBlank @Pattern(regexp = "(?i)(FORWARD|BACKWARD|LEFT|RIGHT|CENTER|STOP)") String command,
        @NotNull @Min(0) @Max(255) Integer speed,
        @NotBlank @Pattern(regexp = "[0-9a-f]{32}") String sessionId,
        @NotNull @Min(1) @Max(2147483647) Long sequence,
        @Pattern(regexp = "LEFT|CENTER|RIGHT") String steering) {
    public MovementRequestDTO(String command, Integer speed, String sessionId, Long sequence) {
        this(command, speed, sessionId, sequence, null);
    }
    @AssertTrue(message = "Steering conflicts with command")
    public boolean isSteeringConsistent() {
        return steering == null || command == null || switch (command) {
            case "LEFT", "RIGHT", "CENTER" -> command.equals(steering);
            case "STOP" -> steering.equals("CENTER");
            default -> true;
        };
    }
    public MovementRequestDTO {
        if (command != null) command = command.toUpperCase(java.util.Locale.ROOT);
    }
}
