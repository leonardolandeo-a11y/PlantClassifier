package com.codewithmosh.plantclassifier.dto;
import jakarta.validation.constraints.*;
public record ServoRequest(@NotNull @Pattern(regexp="INCREASE|DECREASE|HOLD|CENTER") String command,
                           @NotNull @Min(1) @Max(4294967295L) Long epoch,
                           @NotNull @Min(1) @Max(4294967295L) Long sequence) {}
