package com.codewithmosh.plantclassifier.service;

import com.codewithmosh.plantclassifier.exception.MLExecutionException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.TimeUnit;

@Service
public class MLService {

    // Python executable
    @Value("${ml.python.path}")
    private String pythonPath;

    // predict.py path
    @Value("${ml.script.path}")
    private String scriptPath;

    // MLClassification directory
    @Value("${ml.working-directory}")
    private String workingDirectory;

    @Value("${ml.timeout:30s}")
    private Duration timeout;


    public String predict(double temperature, double humidity, double ph) throws IOException, InterruptedException {

        // Configuration
        // ProcessBuilder allows Java to execute external programs/files
        ProcessBuilder processBuilder = new ProcessBuilder(
                pythonPath,                      // Python
                scriptPath,                      // predict.py
                String.valueOf(temperature),     // Convert temperature from double to String
                String.valueOf(humidity),        // Convert humidity from double to String
                String.valueOf(ph)               // Convert pH from double to String
        );

        // Set the directory where predict.py and model.pkl are located
        processBuilder.directory(
                new File(workingDirectory)
        );

        // Keep diagnostics off stdout so the prediction remains the first output line.
        processBuilder.redirectErrorStream(false);

        // Execute the Python file
        Process process = processBuilder.start();

        // Convert Python output into characters
        // BufferedReader allows Java to read the Python output
        try (var processOutput = process.getInputStream();
             var reader = new BufferedReader(new InputStreamReader(processOutput, StandardCharsets.UTF_8))) {
            String prediction = reader.readLine();
            if (!process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS)) {
                process.destroyForcibly();
                process.waitFor();
                throw new MLExecutionException("ML prediction process timed out");
            }
            if (process.exitValue() != 0) {
                throw new MLExecutionException("ML prediction process failed");
            }
            if (prediction == null || prediction.isBlank()) {
                throw new MLExecutionException("ML prediction process returned no prediction");
            }
            return prediction;
        }
    }
}
