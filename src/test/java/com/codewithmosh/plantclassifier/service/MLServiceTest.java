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
        assertEquals("sandía",service("print('sandía')",Duration.ofSeconds(2)).predict(20,60,7,45));
    }
    @Test void passesAllFourArgumentsInOrder() throws Exception {
        assertEquals("tomate",service("import sys\nassert sys.argv[1:] == ['20.0','60.0','7.0','45.0']\nprint('tomate')",Duration.ofSeconds(2)).predict(20,60,7,45));
    }
    @Test void preservesFractionalSoilAndDoesNotReusePreviousProcessOutput() throws Exception {
        var ml=service("import sys\nt,h,p,s=map(float,sys.argv[1:])\nassert (t,h,p)==(26.7,68.4,6.5)\nassert s in (20.25,58.75)\nprint('frijol' if s==20.25 else 'tomate')",Duration.ofSeconds(2));
        assertEquals("frijol",ml.predict(26.7,68.4,6.5,20.25));
        assertEquals("tomate",ml.predict(26.7,68.4,6.5,58.75));
    }
    @Test void mapsDomainAbstentionWithoutReturningACrop() throws Exception {
        var error=assertThrows(SystemFailure.class,()->service("import sys\nprint('Outside model training domain',file=sys.stderr)\nraise SystemExit(2)",Duration.ofSeconds(2)).predict(26.7,68.4,9.1,58));
        assertEquals("ml-out-of-domain",error.category()); assertEquals(422,error.status());
        assertEquals("ml-execution",assertThrows(SystemFailure.class,()->service("raise SystemExit(2)",Duration.ofSeconds(2)).predict(26.7,68.4,9.1,58)).category());
        assertEquals("ml-execution",assertThrows(SystemFailure.class,()->service("print('melón')\nraise SystemExit(2)",Duration.ofSeconds(2)).predict(26.7,68.4,9.1,58)).category());
    }
    @Test void processFailureEmptyUnknownAndOversizedOutput() throws Exception {
        for(String script:new String[]{"raise SystemExit(4)","pass","print('not a plant')","print('arroz')","print('a'*100000)"})
            assertEquals(500,assertThrows(SystemFailure.class,()->service(script,Duration.ofSeconds(2)).predict(20,60,7,45)).status());
    }
    @Test void silentProcessCannotBlockTimeout() throws Exception {
        var ml=service("import time\ntime.sleep(60)",Duration.ofMillis(200));
        assertTimeoutPreemptively(Duration.ofSeconds(3),()->
                assertEquals(504,assertThrows(SystemFailure.class,()->ml.predict(20,60,7,45)).status()));
    }
    @Test void stdoutWithoutNewlineCannotBlockTimeout() throws Exception {
        var ml=service("import sys,time\nsys.stdout.write('frijol'); sys.stdout.flush()\ntime.sleep(60)",Duration.ofMillis(200));
        assertTimeoutPreemptively(Duration.ofSeconds(3),()->assertEquals(504,assertThrows(SystemFailure.class,()->ml.predict(20,60,7,45)).status()));
    }
    @Test void drainsLargeStderrWithoutDeadlock() throws Exception {
        assertEquals("frijol",service("import sys\nsys.stderr.write('x'*2000000)\nprint('frijol')",Duration.ofSeconds(3)).predict(20,60,7,45));
    }
    @Test void preservesInterruptionAndTerminatesChild() throws Exception {
        var ml=service("import time\ntime.sleep(60)",Duration.ofSeconds(30));
        AtomicBoolean interrupted=new AtomicBoolean();
        Thread worker=new Thread(()->{
            try { ml.predict(20,60,7,45); }
            catch(SystemFailure ex) { interrupted.set(Thread.currentThread().isInterrupted() && ex.category().equals("ml-interrupted")); }
        });
        worker.start(); Thread.sleep(100); worker.interrupt(); worker.join(2000);
        assertFalse(worker.isAlive()); assertTrue(interrupted.get());
    }
}
