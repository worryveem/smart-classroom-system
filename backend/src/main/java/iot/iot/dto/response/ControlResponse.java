package iot.iot.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import iot.iot.dto.*;

public record ControlResponse(
    @JsonProperty("device_id") String deviceId,
    ControlTarget target,
    ControlAction action,
    @JsonProperty("trigger_by") String triggerBy,
    CommandStatus status,
    @JsonProperty("log_status") CommandLogStatus logStatus,
    @JsonProperty("retry_safe") boolean retrySafe,
    @JsonProperty("node_red_response") JsonNode nodeRedResponse
) {}
