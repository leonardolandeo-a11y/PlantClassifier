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
            "frijol", "tomate", "sandía", "melón", "lechuga");
    private static final Logger log = LoggerFactory.getLogger(MLService.class);
    private final String python;
    private final String script;
    private final Path directory;
    private final Duration timeout;
    private final boolean persistent;
    private final Semaphore workerSlot = new Semaphore(1);
    private volatile Process worker;
    private final Object workerLifecycle = new Object();
    private boolean shuttingDown;
    private long workerSequence;
    private static final tools.jackson.databind.json.JsonMapper JSON = tools.jackson.databind.json.JsonMapper.builder().build();
    // Each admitted process has two virtual stream readers; no unbounded work queue.
    private final Semaphore capacity = new Semaphore(2);
    private record Output(byte[] bytes, boolean overflow) {}

    public MLService(String python, String script, String directory, Duration timeout) {
        this(python, script, directory, timeout, false);
    }
    @org.springframework.beans.factory.annotation.Autowired
    public MLService(@Value("${ml.python.path}") String python, @Value("${ml.script.path}") String script,
                     @Value("${ml.working-directory}") String directory, @Value("${ml.timeout}") Duration timeout,
                     @Value("${ml.persistent:true}") boolean persistent) {
        if (timeout.isNegative() || timeout.isZero()) throw new IllegalArgumentException("ML timeout must be positive");
        this.python = python;
        this.script = script;
        this.directory = Path.of(directory).toAbsolutePath().normalize();
        this.timeout = timeout; this.persistent = persistent;
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
    public String predict(double temperature, double humidity, double ph, double soilMoisture) {
        if (!Double.isFinite(temperature) || !Double.isFinite(humidity) || !Double.isFinite(ph)
                || !Double.isFinite(soilMoisture) || temperature < 0 || temperature > 50
                || humidity < 0 || humidity > 100 || ph < 0 || ph > 14 || soilMoisture < 0 || soilMoisture > 100) {
            throw new SystemFailure(500, "ml-input", "Invalid prediction input");
        }
        if (persistent) return predictPersistent(temperature, humidity, ph, soilMoisture);
        if (!capacity.tryAcquire()) throw new SystemFailure(503, "ml-busy", "Prediction capacity is busy");
        Process process = null;
        FutureTask<Output> stdout = null;
        FutureTask<Output> stderr = null;
        long deadline = System.nanoTime() + timeout.toNanos();
        try {
            process = new ProcessBuilder(python, script, Double.toString(temperature), Double.toString(humidity),
                    Double.toString(ph), Double.toString(soilMoisture)).directory(directory.toFile()).start();
            process.getOutputStream().close();
            final Process running = process;
            stdout = new FutureTask<>(() -> drain(running.getInputStream()));
            stderr = new FutureTask<>(() -> drain(running.getErrorStream()));
            Thread.ofVirtual().name("ml-stdout").start(stdout);
            Thread.ofVirtual().name("ml-stderr").start(stderr);
            if (!process.waitFor(remaining(deadline), TimeUnit.NANOSECONDS)) throw new TimeoutException();
            Output out = stdout.get(remaining(deadline), TimeUnit.NANOSECONDS);
            Output err = stderr.get(remaining(deadline), TimeUnit.NANOSECONDS);
            if (process.exitValue() == 2 && out.bytes().length == 0 && !out.overflow() && !err.overflow()
                    && new String(err.bytes(), StandardCharsets.UTF_8).strip().equals("Outside model training domain")) {
                throw new SystemFailure(422, "ml-out-of-domain", "Measurements outside model training domain");
            }
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
    private String predictPersistent(double temperature, double humidity, double ph, double soil) {
        if (!workerSlot.tryAcquire()) throw new SystemFailure(503, "ml-busy", "Prediction worker is busy");
        FutureTask<String> task = null;
        try {
            Process current;
            synchronized (workerLifecycle) {
                if (shuttingDown) throw new SystemFailure(503,"ml-stopped","Prediction service is shutting down");
                if (worker == null || !worker.isAlive()) {
                    closeWorker();
                    worker = new ProcessBuilder(python, script, "--worker").directory(directory.toFile())
                            .redirectError(ProcessBuilder.Redirect.DISCARD).start();
                }
                current = worker;
            }
            long id = ++workerSequence;
            byte[] request = JSON.writeValueAsBytes(java.util.Map.of("id", id, "values", new double[]{temperature,humidity,ph,soil}));
            task = new FutureTask<>(() -> {
                current.getOutputStream().write(request); current.getOutputStream().write('\n'); current.getOutputStream().flush();
                var line = new ByteArrayOutputStream();
                int next;
                while ((next = current.getInputStream().read()) != -1 && next != '\n') {
                    if (line.size() >= 4096) throw new IOException("Oversized worker response");
                    line.write(next);
                }
                if (next == -1) throw new EOFException("Worker exited");
                return line.toString(StandardCharsets.UTF_8);
            });
            Thread.ofVirtual().name("ml-worker-response").start(task);
            var reply = JSON.readTree(task.get(timeout.toMillis(), TimeUnit.MILLISECONDS));
            if (reply.path("id").asLong(-1) != id) throw new IOException("Uncorrelated worker response");
            String status = reply.path("status").asString("");
            if (status.equals("out-of-domain")) throw new SystemFailure(422,"ml-out-of-domain","Measurements outside model training domain");
            String prediction = reply.path("prediction").asString("");
            if (!status.equals("ok") || !LABELS.contains(prediction)) throw new IOException("Invalid worker response");
            return prediction;
        } catch (TimeoutException error) {
            closeWorker(); throw new SystemFailure(504,"ml-timeout","Prediction worker timed out");
        } catch (InterruptedException error) {
            closeWorker(); Thread.currentThread().interrupt(); throw new SystemFailure(503,"ml-interrupted","Prediction interrupted");
        } catch (IOException | ExecutionException | RuntimeException error) {
            if (error instanceof SystemFailure failure) throw failure;
            closeWorker(); throw new SystemFailure(500,"ml-execution","Prediction worker failed; next request starts a fresh worker");
        } finally {
            if (task != null) task.cancel(true);
            workerSlot.release();
        }
    }
    @jakarta.annotation.PreDestroy
    public void shutdown() {
        synchronized (workerLifecycle) { shuttingDown = true; closeWorker(); }
    }
    public void closeWorker() {
        Process current;
        synchronized (workerLifecycle) { current = worker; worker = null; }
        if (current != null) {
            current.descendants().forEach(ProcessHandle::destroyForcibly);
            current.destroyForcibly();
            try {
                if (current.waitFor(500, TimeUnit.MILLISECONDS)) {
                    current.getInputStream().close(); current.getOutputStream().close(); current.getErrorStream().close();
                }
            } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
            catch (IOException ignored) { /* Already closed by the process reaper. */ }
        }
    }
}
