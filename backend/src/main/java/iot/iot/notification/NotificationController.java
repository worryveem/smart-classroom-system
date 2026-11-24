package iot.iot.notification;

import iot.iot.common.ApiResponse;
import iot.iot.security.user.CustomUserDetails;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {
    private final NotificationService service;
    public NotificationController(NotificationService service) { this.service=service; }
    private Object ok(Object data) { return ResponseEntity.ok().header("Cache-Control","no-store").body(ApiResponse.ok("Thành công",data)); }
    public record ReadAll(@Min(0) long upToId) {}
    @GetMapping public Object list(@AuthenticationPrincipal CustomUserDetails actor,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="20") int size,@RequestParam(defaultValue="false") boolean unreadOnly) { return ok(service.list(actor,page,size,unreadOnly)); }
    @GetMapping("/unread-count") public Object count(@AuthenticationPrincipal CustomUserDetails actor) { return ok(java.util.Map.of("count",service.unread(actor))); }
    @PatchMapping("/{id}/read") public Object read(@PathVariable long id,@AuthenticationPrincipal CustomUserDetails actor) { service.read(id,actor); return ok(null); }
    @PostMapping("/read-all") public Object readAll(@Valid @RequestBody ReadAll input,@AuthenticationPrincipal CustomUserDetails actor) { service.readAll(input.upToId(),actor); return ok(null); }
}
