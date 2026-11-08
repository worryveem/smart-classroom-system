package iot.iot.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import iot.iot.entity.Telemetry;
import java.time.LocalDateTime;

public record TelemetryResponse(Long id, @JsonProperty("device_id") String deviceId,
        Double temp, Double humid, Double lux, Boolean occupancy, LocalDateTime timestamp) {
    public static TelemetryResponse from(Telemetry row) {
        return new TelemetryResponse(row.getId(), row.getDevice().getDeviceId(), row.getTemp(),
            row.getHumid(), row.getLux(), row.getOccupancy(), row.getTimestamp());
    }
}
