package iot.iot.integration.nodered;

import com.fasterxml.jackson.databind.JsonNode;
import iot.iot.dto.CommandStatus;

public record NodeRedCommandResponse(CommandStatus status, JsonNode payload) {}
