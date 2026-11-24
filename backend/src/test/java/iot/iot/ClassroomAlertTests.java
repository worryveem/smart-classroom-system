package iot.iot;

import iot.iot.classroom.ClassroomAlertService;
import iot.iot.classroom.ClassroomAlertService.Sample;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ClassroomAlertTests {
    private final LocalDateTime now=LocalDateTime.of(2026,11,8,12,0);
    private Sample sample(int seconds,Double temp) { return new Sample(now.minusSeconds(seconds),temp,100.0,true); }
    private boolean hot(List<Sample> rows) { return ClassroomAlertService.sustained(rows,now,120,90,s->s.temperature()!=null && s.temperature()>32); }
    @Test void shortSpikesAndStaleDataNeverTriggerSustainedAlert() {
        assertFalse(hot(List.of(sample(30,35.0),sample(0,35.0))));
        assertFalse(hot(List.of(sample(300,35.0),sample(240,35.0),sample(180,35.0))));
    }
    @Test void gapsMissingValuesAndRecoveryBreakContinuity() {
        assertFalse(hot(List.of(sample(180,35.0),sample(0,35.0))));
        assertFalse(hot(List.of(sample(120,35.0),sample(60,null),sample(0,35.0))));
        assertFalse(hot(List.of(sample(120,35.0),sample(60,35.0),sample(0,25.0))));
    }
    @Test void consecutiveObservationsTriggerWithoutInventingSamples() {
        assertTrue(hot(List.of(sample(120,35.0),sample(60,35.0),sample(0,35.0))));
        assertFalse(hot(List.of()));
    }
}
