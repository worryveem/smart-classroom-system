package iot.iot.controller;

import iot.iot.common.ApiResponse;
import iot.iot.dto.response.TelemetryResponse;
import iot.iot.service.TelemetryService;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/telemetry")
public class TelemetryController {
    private final TelemetryService service;
    public TelemetryController(TelemetryService service) { this.service = service; }

    @GetMapping
    public ResponseEntity<ApiResponse<List<TelemetryResponse>>> history(
            @RequestParam(required = false) String deviceId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
            @RequestParam(defaultValue = "100") int limit) {
        return ResponseEntity.ok().header("Cache-Control", "no-store")
            .body(ApiResponse.ok("Success", service.history(deviceId, from, to, limit)));
    }
}
