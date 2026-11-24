package iot.iot.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "telemetry")
public class Telemetry {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "device_id", nullable = false)
    private Device device;

    @Column(name = "temp")
    private Double temp;

    @Column(name = "humid")
    private Double humid;

    @Column(name = "lux")
    private Double lux;

    @Column(name = "occupancy", columnDefinition = "TINYINT(1)")
    private Boolean occupancy;

    @org.hibernate.annotations.Generated(event = org.hibernate.generator.EventType.INSERT)
    @Column(name = "`timestamp`", nullable = false, insertable = false, updatable = false, columnDefinition = "DATETIME")
    private LocalDateTime timestamp;

    public Telemetry() {}

    public Long getId() { return id; }
    public Device getDevice() { return device; }
    public void setDevice(Device device) { this.device = device; }
    public Double getTemp() { return temp; }
    public void setTemp(Double temp) { this.temp = temp; }
    public Double getHumid() { return humid; }
    public void setHumid(Double humid) { this.humid = humid; }
    public Double getLux() { return lux; }
    public void setLux(Double lux) { this.lux = lux; }
    public Boolean getOccupancy() { return occupancy; }
    public void setOccupancy(Boolean occupancy) { this.occupancy = occupancy; }
    public LocalDateTime getTimestamp() { return timestamp; }
}
