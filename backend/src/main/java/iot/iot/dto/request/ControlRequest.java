package iot.iot.dto.request;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import iot.iot.dto.ControlAction;
import iot.iot.dto.ControlTarget;
import jakarta.validation.constraints.NotNull;

public record ControlRequest(@NotNull ControlTarget target, @NotNull ControlAction action) {
    @JsonAnySetter
    public void rejectUnknownField(String name, Object value) {
        throw new IllegalArgumentException("Unexpected control request field");
    }
}
