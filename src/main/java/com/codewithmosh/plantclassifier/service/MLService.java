package com.codewithmosh.plantclassifier.service;

import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;

@Service
public class MLService {

    public String predict(double temperature, double humidity, double ph) throws IOException, InterruptedException {
        try {
            // Configuration (ProcessBuilder allows java to read external files)
            ProcessBuilder processBuilder = new ProcessBuilder(
                    "/home/leonard/IdeaProjects/PlantClassifier/MLClassification/venv/bin/python",  // python
                    "/home/leonard/IdeaProjects/PlantClassifier/MLClassification/predict.py",   // predict.py
                    String.valueOf(temperature),   // value of temperature (converting from double to string )
                    String.valueOf(humidity),     // value of the humidity (converting from double to string )
                    String.valueOf(ph)            // value of the ph  (converting from double to string )
            );
            processBuilder.directory(
                    new File("/home/leonard/IdeaProjects/PlantClassifier/MLClassification")
            );
            // Execute python file
            Process process = processBuilder.start();

            // Convert python output (binary) into a characters
            // BufferedReader allow us to read this output
            BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream())
            );

            // Method to read the output
            String prediction = reader.readLine();
            // Wait until python finish
            process.waitFor();

            // Return the output of the ML model
            return prediction;
        }catch (IOException | InterruptedException e){
            throw new RuntimeException("Error", e);
        }
    }

}