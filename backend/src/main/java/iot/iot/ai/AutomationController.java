package iot.iot.ai;

import iot.iot.common.ApiResponse;
import iot.iot.security.user.CustomUserDetails;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/automation")
@PreAuthorize("hasAnyRole('ADMIN','TEACHER')")
public class AutomationController {
    private final AutomationService service;
    public AutomationController(AutomationService service) { this.service=service; }
    private Object ok(Object data) { return ResponseEntity.ok().header("Cache-Control","no-store").body(ApiResponse.ok("Cấu hình tự động phòng 101",data)); }
    @GetMapping public Object get(@AuthenticationPrincipal CustomUserDetails actor) { return ok(service.get(actor)); }
    @PutMapping public Object save(@Valid @RequestBody AutomationService.Settings input,@AuthenticationPrincipal CustomUserDetails actor) { return ok(service.save(input,actor)); }
}
