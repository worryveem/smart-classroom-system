package iot.iot.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "devices")
public class Device {
    @Id
    @Column(name = "device_id", length = 50)
    private String deviceId;

    @Column(name = "room_id", nullable = false)
    private Integer roomId;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, columnDefinition = "ENUM('SENSOR','ACTUATOR')")
    private DeviceType type;

    @Column(name = "mac_address", length = 50)
    private String macAddress;

    @Convert(converter = DeviceStatusConverter.class)
    @Column(name = "status", nullable = false, columnDefinition = "ENUM('Active','Offline','Suspended')")
    private DeviceStatus status;

    @org.hibernate.annotations.Generated(event = org.hibernate.generator.EventType.INSERT)
    @Column(name = "created_at", nullable = false, insertable = false, updatable = false, columnDefinition = "DATETIME")
    private LocalDateTime createdAt;

    public Device() {}

    public String getDeviceId() { return deviceId; }
    public void setDeviceId(String deviceId) { this.deviceId = deviceId; }
    public Integer getRoomId() { return roomId; }
    public void setRoomId(Integer roomId) { this.roomId = roomId; }
    public DeviceType getType() { return type; }
    public void setType(DeviceType type) { this.type = type; }
    public String getMacAddress() { return macAddress; }
    public void setMacAddress(String macAddress) { this.macAddress = macAddress; }
    public DeviceStatus getStatus() { return status; }
    public void setStatus(DeviceStatus status) { this.status = status; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
