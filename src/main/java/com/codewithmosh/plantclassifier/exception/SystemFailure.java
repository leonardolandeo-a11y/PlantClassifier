package com.codewithmosh.plantclassifier.exception;

public class SystemFailure extends RuntimeException {
    private final int status;
    private final String category;
    public SystemFailure(int status, String category, String safeMessage) {
        super(safeMessage);
        this.status = status;
        this.category = category;
    }
    public int status() { return status; }
    public String category() { return category; }
}
