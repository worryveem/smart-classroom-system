package iot.iot.integration.nodered;

import iot.iot.dto.ControlAction;
import iot.iot.dto.ControlTarget;

// The shared wire contract contains exactly these two fields.
public record NodeRedCommandRequest(ControlTarget target, ControlAction action) {}
