package com.codewithmosh.plantclassifier.service;

import com.codewithmosh.plantclassifier.exception.MLExecutionException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;

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

        // Merge Python errors with the normal output
        processBuilder.redirectErrorStream(true);

        // Execute the Python file
        Process process = processBuilder.start();

        // Convert Python output into characters
        // BufferedReader allows Java to read the Python output
        BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));

        // Read the prediction returned by Python
        String prediction = reader.readLine();

        // Wait until Python finishes
        int exitCode = process.waitFor();

        // If Python finishes with an error
        if (exitCode != 0) {
            throw new MLExecutionException("ML prediction process failed");
        }

        // Return the output of the ML model
        return prediction;
    }
}