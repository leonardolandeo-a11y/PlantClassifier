package com.codewithmosh.plantclassifier.dto;

public record MovementAck(String status, String command, Integer speed, Boolean simulated,
                          String sessionId, Long sequence) {}
