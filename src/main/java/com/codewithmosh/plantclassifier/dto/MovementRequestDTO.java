package com.codewithmosh.plantclassifier.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@AllArgsConstructor
@Getter
@Setter
@NoArgsConstructor
public class MovementRequestDTO {

    @NotBlank
    @Pattern(regexp = "(?i)^(FORWARD|BACKWARD|LEFT|RIGHT|CENTER|STOP)$", message = "Unsupported movement command")
    private String command;
    @NotNull
    @Min(0)
    @Max(255)
    private Integer speed;
}
