package com.codewithmosh.plantclassifier.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
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
    String command;
    @NotBlank
    @Min(0)
    @Max(255)
    int speed;
}
