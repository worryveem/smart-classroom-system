package iot.iot.controller;

import iot.iot.common.ApiResponse;
import iot.iot.dto.CommandStatus;
import iot.iot.dto.request.ControlRequest;
import iot.iot.dto.response.ControlResponse;
import iot.iot.security.user.CustomUserDetails;
import iot.iot.service.ControlService;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
public class ControlController {
    private final ControlService control;
    public ControlController(ControlService control) { this.control = control; }
    @PostMapping("/api/control")
    public ResponseEntity<ApiResponse<ControlResponse>> control(@Valid @RequestBody ControlRequest request,
            @AuthenticationPrincipal CustomUserDetails user) {
        ControlResponse response = control.control(request, user.getUsername());
        boolean executed = response.status() == CommandStatus.SUCCESS;
        return ResponseEntity.status(executed ? HttpStatus.OK : HttpStatus.ACCEPTED).cacheControl(CacheControl.noStore())
            .body(ApiResponse.ok(executed ? "Command executed successfully" : "Command accepted", response));
    }
}
