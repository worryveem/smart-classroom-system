package iot.iot.dto.request;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import iot.iot.entity.DeviceType;
import jakarta.validation.constraints.*;

public record UpdateDeviceRequest(
        @NotNull @Positive Integer roomId,
        @NotNull DeviceType type,
        @Pattern(regexp = "(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}") String macAddress,
        @NotNull DeviceStatusInput status) {
    @JsonAnySetter public void rejectUnknown(String name, Object value) {
        throw new IllegalArgumentException("Unknown request field");
    }
}
