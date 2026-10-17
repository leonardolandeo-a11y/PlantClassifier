package com.codewithmosh.plantclassifier.service;

import com.codewithmosh.plantclassifier.exception.SystemFailure;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.*;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.junit.jupiter.api.Assertions.*;

class MLServiceTest {
    @TempDir Path directory;
    MLService service(String script,Duration timeout) throws Exception {
        Files.writeString(directory.resolve("predict.py"),script);
        return new MLService("python3","predict.py",directory.toString(),timeout);
    }
    @Test void successfulUnicodePrediction() throws Exception {
        assertEquals("café",service("print('café')",Duration.ofSeconds(2)).predict(20,60,7));
    }
    @Test void processFailureEmptyUnknownAndOversizedOutput() throws Exception {
        for(String script:new String[]{"raise SystemExit(4)","pass","print('not a plant')","print('a'*100000)"})
            assertEquals(500,assertThrows(SystemFailure.class,()->service(script,Duration.ofSeconds(2)).predict(20,60,7)).status());
    }
    @Test void silentProcessCannotBlockTimeout() throws Exception {
        var ml=service("import time\ntime.sleep(60)",Duration.ofMillis(200));
        assertTimeoutPreemptively(Duration.ofSeconds(3),()->
                assertEquals(504,assertThrows(SystemFailure.class,()->ml.predict(20,60,7)).status()));
    }
    @Test void stdoutWithoutNewlineCannotBlockTimeout() throws Exception {
        var ml=service("import sys,time\nsys.stdout.write('arroz'); sys.stdout.flush()\ntime.sleep(60)",Duration.ofMillis(200));
        assertTimeoutPreemptively(Duration.ofSeconds(3),()->assertEquals(504,assertThrows(SystemFailure.class,()->ml.predict(20,60,7)).status()));
    }
    @Test void drainsLargeStderrWithoutDeadlock() throws Exception {
        assertEquals("arroz",service("import sys\nsys.stderr.write('x'*2000000)\nprint('arroz')",Duration.ofSeconds(3)).predict(20,60,7));
    }
    @Test void preservesInterruptionAndTerminatesChild() throws Exception {
        var ml=service("import time\ntime.sleep(60)",Duration.ofSeconds(30));
        AtomicBoolean interrupted=new AtomicBoolean();
        Thread worker=new Thread(()->{
            try { ml.predict(20,60,7); }
            catch(SystemFailure ex) { interrupted.set(Thread.currentThread().isInterrupted() && ex.category().equals("ml-interrupted")); }
        });
        worker.start(); Thread.sleep(100); worker.interrupt(); worker.join(2000);
        assertFalse(worker.isAlive()); assertTrue(interrupted.get());
    }
}
