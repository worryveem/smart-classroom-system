package iot.iot.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import iot.iot.entity.*;
import java.time.LocalDateTime;

public record DeviceResponse(@JsonProperty("device_id") String deviceId,
        @JsonProperty("room_id") Integer roomId, DeviceType type,
        @JsonProperty("mac_address") String macAddress, DeviceStatus status,
        @JsonProperty("created_at") LocalDateTime createdAt) {
    public static DeviceResponse from(Device device) {
        return new DeviceResponse(device.getDeviceId(), device.getRoomId(), device.getType(),
            device.getMacAddress(), device.getStatus(), device.getCreatedAt());
    }
}
