package com.codewithmosh.plantclassifier.dto;
public record ServoStatus(int angle, String state, long epoch, long deviceTimeMs) {}
