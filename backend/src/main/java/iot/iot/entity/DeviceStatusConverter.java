package iot.iot.entity;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter
public class DeviceStatusConverter implements AttributeConverter<DeviceStatus, String> {
    @Override
    public String convertToDatabaseColumn(DeviceStatus status) {
        if (status == null) return null;
        return switch (status) {
            case ACTIVE -> "Active";
            case OFFLINE -> "Offline";
            case SUSPENDED -> "Suspended";
        };
    }

    @Override
    public DeviceStatus convertToEntityAttribute(String status) {
        if (status == null) return null;
        return switch (status) {
            case "Active" -> DeviceStatus.ACTIVE;
            case "Offline" -> DeviceStatus.OFFLINE;
            case "Suspended" -> DeviceStatus.SUSPENDED;
            default -> throw new IllegalArgumentException("Unknown device status: " + status);
        };
    }
}
