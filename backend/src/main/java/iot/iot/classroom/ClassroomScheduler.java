package iot.iot.classroom;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

@Configuration
@EnableScheduling
@ConditionalOnProperty(name="app.classroom.alerts-enabled",havingValue="true",matchIfMissing=true)
public class ClassroomScheduler {
    private static final Logger log=LoggerFactory.getLogger(ClassroomScheduler.class);
    private final ClassroomAlertService alerts;
    public ClassroomScheduler(ClassroomAlertService alerts) { this.alerts=alerts; }
    @Scheduled(fixedDelayString="${app.classroom.alert-interval-ms:30000}",initialDelay=15000)
    public void tick() {
        try { alerts.evaluate(); }
        catch(RuntimeException error) { log.warn("Classroom alert evaluation failed ({})",error.getClass().getSimpleName()); }
    }
}
