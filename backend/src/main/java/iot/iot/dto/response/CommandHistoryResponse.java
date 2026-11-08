package iot.iot.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import iot.iot.entity.CommandLog;
import java.time.LocalDateTime;

public record CommandHistoryResponse(Long id, @JsonProperty("device_id") String deviceId,
        String target, String action, @JsonProperty("trigger_by") String triggerBy, LocalDateTime timestamp) {
    public static CommandHistoryResponse from(CommandLog row) {
        return new CommandHistoryResponse(row.getId(), row.getDevice().getDeviceId(), row.getTarget(),
            row.getAction(), row.getTriggerBy(), row.getTimestamp());
    }
}
