package iot.iot.alerts;

import iot.iot.common.ApiResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/rooms/{roomId}/abnormal-alerts")
@PreAuthorize("hasAnyRole('ADMIN','TEACHER')")
public class AbnormalAlertController {
    private final AbnormalAlertService service;
    public AbnormalAlertController(AbnormalAlertService service) { this.service=service; }
    @GetMapping public Object get(@PathVariable int roomId) {
        return ResponseEntity.ok().header("Cache-Control","no-store").body(ApiResponse.ok("Cảnh báo bất thường theo thiết bị",service.get(roomId)));
    }
}
