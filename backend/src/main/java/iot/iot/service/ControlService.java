package iot.iot.service;

import iot.iot.dto.*;
import iot.iot.dto.request.ControlRequest;
import iot.iot.dto.response.ControlResponse;
import iot.iot.exception.IntegrationException;
import iot.iot.integration.nodered.*;
import iot.iot.repository.DeviceRepository;
import iot.iot.repository.UserRepository;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.TransactionException;

@Service
public class ControlService {
    private final NodeRedClient nodeRed;
    private final DeviceRepository devices;
    private final CommandAuditService audit;
    private final NodeRedProperties properties;
    private final UserRepository users;
    public ControlService(NodeRedClient nodeRed, DeviceRepository devices, CommandAuditService audit, NodeRedProperties properties, UserRepository users) {
        this.nodeRed = nodeRed; this.devices = devices; this.audit = audit; this.properties = properties; this.users = users;
    }

    // Intentionally no transaction around the outbound HTTP/ACK wait.
    public ControlResponse control(ControlRequest request, String username) {
        // Legacy users may predate the reserved-name validation; reject before dispatch, never after a physical command.
        if (users.matchesReservedCommandActor(username) != 0) {
            throw new IntegrationException(HttpStatus.FORBIDDEN, "Username RULE_ENGINE is reserved for automatic commands");
        }
        return dispatch(request, username);
    }

    // Internal entry point: never expose the automatic actor through an HTTP request body.
    public ControlResponse automatic(ControlRequest request) {
        return dispatch(request, "RULE_ENGINE");
    }

    private ControlResponse dispatch(ControlRequest request, String username) {
        String deviceId = properties.actuatorDeviceId();
        if (!devices.existsByDeviceId(deviceId)) {
            throw new IntegrationException(HttpStatus.NOT_FOUND, "Configured actuator device was not found");
        }
        var command = new NodeRedCommandRequest(request.target(), request.action());
        NodeRedCommandResponse response;
        try { response = nodeRed.command(command); }
        catch (IntegrationException error) {
            CommandStatus status = error.getStatus() == HttpStatus.GATEWAY_TIMEOUT ? CommandStatus.TIMEOUT : CommandStatus.FAILURE;
            String message = error.getMessage();
            if (error.getStatus() == HttpStatus.GATEWAY_TIMEOUT || error.getStatus() == HttpStatus.SERVICE_UNAVAILABLE) {
                message += ". Command outcome is unconfirmed; do not resend automatically";
            }
            throw new IntegrationException(error.getStatus(), message,
                new ControlResponse(deviceId, request.target(), request.action(), username, status,
                    CommandLogStatus.NOT_RECORDED, false, null));
        }
        try { audit.recordConfirmed(deviceId, command, username); }
        catch (DataAccessException | TransactionException error) {
            throw new IntegrationException(HttpStatus.INTERNAL_SERVER_ERROR,
                "Command was confirmed by Node-RED but command history could not be saved. Do not resend automatically",
                new ControlResponse(deviceId, request.target(), request.action(), username, response.status(),
                    CommandLogStatus.FAILED, false, response.payload()));
        }
        return new ControlResponse(deviceId, request.target(), request.action(), username, response.status(),
            CommandLogStatus.SAVED, false, response.payload());
    }
}
