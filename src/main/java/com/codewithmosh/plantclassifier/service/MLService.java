package com.codewithmosh.plantclassifier.service;

import com.codewithmosh.plantclassifier.exception.SystemFailure;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.*;

@Service
public class MLService {
    private static final java.util.Set<String> LABELS = java.util.Set.of(
            "algodón", "arroz", "café", "coco", "frijol chino", "frijol de palo", "frijol moth", "frijol rojo", "frijol urad", "garbanzo", "granada", "lenteja", "mango", "manzana", "maíz", "melón", "naranja", "papaya", "plátano", "sandía", "uva", "yute");
    private static final Logger log = LoggerFactory.getLogger(MLService.class);
    private final String python;
    private final String script;
    private final Path directory;
    private final Duration timeout;
    // Each admitted process has two virtual stream readers; no unbounded work queue.
    private final Semaphore capacity = new Semaphore(2);
    private record Output(byte[] bytes, boolean overflow) {}

    public MLService(@Value("${ml.python.path}") String python, @Value("${ml.script.path}") String script,
                     @Value("${ml.working-directory}") String directory, @Value("${ml.timeout}") Duration timeout) {
        if (timeout.isNegative() || timeout.isZero()) throw new IllegalArgumentException("ML timeout must be positive");
        this.python = python;
        this.script = script;
        this.directory = Path.of(directory).toAbsolutePath().normalize();
        this.timeout = timeout;
    }
    private static Output drain(InputStream input) throws IOException {
        try (input; var retained = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            boolean overflow = false;
            int count;
            while ((count = input.read(buffer)) != -1) {
                int keep = Math.min(count, 4096 - retained.size());
                retained.write(buffer, 0, keep);
                overflow |= keep != count;
            }
            return new Output(retained.toByteArray(), overflow);
        }
    }
    private static long remaining(long deadline) throws TimeoutException {
        long left = deadline - System.nanoTime();
        if (left <= 0) throw new TimeoutException();
        return left;
    }
    public String predict(double temperature, double humidity, double ph) {
        if (!Double.isFinite(temperature) || !Double.isFinite(humidity) || !Double.isFinite(ph)) {
            throw new SystemFailure(500, "ml-input", "Invalid prediction input");
        }
        if (!capacity.tryAcquire()) throw new SystemFailure(503, "ml-busy", "Prediction capacity is busy");
        Process process = null;
        FutureTask<Output> stdout = null;
        FutureTask<Output> stderr = null;
        long deadline = System.nanoTime() + timeout.toNanos();
        try {
            process = new ProcessBuilder(python, script, Double.toString(temperature), Double.toString(humidity),
                    Double.toString(ph)).directory(directory.toFile()).start();
            process.getOutputStream().close();
            final Process running = process;
            stdout = new FutureTask<>(() -> drain(running.getInputStream()));
            stderr = new FutureTask<>(() -> drain(running.getErrorStream()));
            Thread.ofVirtual().name("ml-stdout").start(stdout);
            Thread.ofVirtual().name("ml-stderr").start(stderr);
            if (!process.waitFor(remaining(deadline), TimeUnit.NANOSECONDS)) throw new TimeoutException();
            Output out = stdout.get(remaining(deadline), TimeUnit.NANOSECONDS);
            Output err = stderr.get(remaining(deadline), TimeUnit.NANOSECONDS);
            if (process.exitValue() != 0) {
                log.warn("ML exited with code {}; stderr bytes retained={}, truncated={}",
                        process.exitValue(), err.bytes().length, err.overflow());
                throw new SystemFailure(500, "ml-execution", "Prediction process failed");
            }
            String result = new String(out.bytes(), StandardCharsets.UTF_8).strip();
            if (out.overflow() || !LABELS.contains(result)) {
                throw new SystemFailure(500, "ml-output", "Prediction process returned invalid output");
            }
            return result;
        } catch (TimeoutException ex) {
            log.warn("ML exceeded configured execution timeout");
            throw new SystemFailure(504, "ml-timeout", "Prediction timed out");
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new SystemFailure(503, "ml-interrupted", "Prediction interrupted");
        } catch (IOException | ExecutionException ex) {
            log.warn("ML process I/O failed: {}", ex.getClass().getSimpleName());
            throw new SystemFailure(500, "ml-execution", "Prediction process could not complete");
        } finally {
            if (process != null) {
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
                try { process.getInputStream().close(); process.getErrorStream().close(); }
                catch (IOException ex) { log.debug("ML streams already closed"); }
            }
            if (stdout != null) stdout.cancel(true);
            if (stderr != null) stderr.cancel(true);
            capacity.release();
        }
    }
}
