package iot.iot.ai;

import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

@Configuration
@EnableScheduling
@ConditionalOnProperty(name="app.automation.scheduler-enabled",havingValue="true",matchIfMissing=true)
public class AutomationScheduler {
    private final AutomationService service;
    public AutomationScheduler(AutomationService service) { this.service=service; }
    @Scheduled(fixedDelayString="${app.automation.interval-ms:30000}",initialDelay=15000)
    public void tick() {
        try { service.tick(); }
        catch(RuntimeException error) { LoggerFactory.getLogger(getClass()).warn("Automation evaluation failed ({})",error.getClass().getSimpleName()); }
    }
}
