package com.codewithmosh.plantclassifier;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import com.codewithmosh.plantclassifier.exception.MLExecutionException;



import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.io.IOException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(IOException.class)
    public ProblemDetail handleIOException(IOException exception) {

        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.INTERNAL_SERVER_ERROR);

        problem.setTitle("ML Service Error");
        problem.setDetail("An error occurred while executing the machine learning model.");

        return problem;
    }

    @ExceptionHandler(InterruptedException.class)
    public ProblemDetail handleInterruptedException(InterruptedException exception) {

        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.INTERNAL_SERVER_ERROR);

        problem.setTitle("ML Process Interrupted");
        problem.setDetail("The machine learning process was interrupted.");

        return problem;
    }
    @ExceptionHandler(MLExecutionException.class)
    public ProblemDetail handleMLExecutionException(MLExecutionException exception) {

        ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.INTERNAL_SERVER_ERROR);

        problem.setTitle("ML Prediction Error");
        problem.setDetail(exception.getMessage());

        return problem;
    }
}

