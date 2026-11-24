package iot.iot.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "command_logs")
public class CommandLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "device_id", nullable = false)
    private Device device;

    @Column(name = "target", length = 20, nullable = false)
    private String target;

    @Column(name = "action", length = 20, nullable = false)
    private String action;

    @Column(name = "trigger_by", length = 50, nullable = false)
    private String triggerBy;

    @org.hibernate.annotations.Generated(event = org.hibernate.generator.EventType.INSERT)
    @Column(name = "`timestamp`", nullable = false, insertable = false, updatable = false, columnDefinition = "DATETIME")
    private LocalDateTime timestamp;

    public CommandLog() {}

    public Long getId() { return id; }
    public Device getDevice() { return device; }
    public void setDevice(Device device) { this.device = device; }
    public String getTarget() { return target; }
    public void setTarget(String target) { this.target = target; }
    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }
    public String getTriggerBy() { return triggerBy; }
    public void setTriggerBy(String triggerBy) { this.triggerBy = triggerBy; }
    public LocalDateTime getTimestamp() { return timestamp; }
}
