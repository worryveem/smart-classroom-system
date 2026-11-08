package iot.iot.controller;

import iot.iot.common.ApiResponse;
import iot.iot.dto.ControlTarget;
import iot.iot.dto.response.CommandHistoryResponse;
import iot.iot.dto.response.HistoryPageResponse;
import iot.iot.service.CommandHistoryService;
import java.time.LocalDateTime;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/commands")
public class CommandHistoryController {
    private final CommandHistoryService service;
    public CommandHistoryController(CommandHistoryService service) { this.service = service; }

    @GetMapping
    public ResponseEntity<ApiResponse<HistoryPageResponse<CommandHistoryResponse>>> history(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String deviceId,
            @RequestParam(required = false) ControlTarget target,
            @RequestParam(required = false) String triggerBy,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to) {
        return ResponseEntity.ok().header("Cache-Control", "no-store")
            .body(ApiResponse.ok("Success", service.history(page, size, deviceId, target, triggerBy, from, to)));
    }
}
