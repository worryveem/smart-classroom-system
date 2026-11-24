package iot.iot.dto.request;

import com.fasterxml.jackson.annotation.JsonCreator;
import iot.iot.entity.DeviceStatus;

public enum DeviceStatusInput {
    ACTIVE, OFFLINE, SUSPENDED;

    @JsonCreator public static DeviceStatusInput parse(String value) {
        return switch (value) {
            case "ACTIVE", "Active" -> ACTIVE;
            case "OFFLINE", "Offline" -> OFFLINE;
            case "SUSPENDED", "Suspended" -> SUSPENDED;
            default -> throw new IllegalArgumentException("Invalid device status");
        };
    }
    public DeviceStatus entityValue() { return DeviceStatus.valueOf(name()); }
}
