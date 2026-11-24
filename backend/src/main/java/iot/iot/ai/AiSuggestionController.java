package iot.iot.ai;

import iot.iot.common.ApiResponse;
import iot.iot.security.user.CustomUserDetails;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/ai/rooms/{roomId}")
@PreAuthorize("hasAnyRole('ADMIN','TEACHER')")
public class AiSuggestionController {
    private final AiSuggestionService service;
    public AiSuggestionController(AiSuggestionService service) { this.service=service; }
    private Object ok(Object data) {
        return ResponseEntity.ok().header("Cache-Control","no-store").body(ApiResponse.ok("Gợi ý AI thử nghiệm",data));
    }
    @GetMapping("/status") public Object status(@PathVariable int roomId) { return ok(service.status(roomId)); }
    @PostMapping("/occupancy-live") public Object occupancyLive(@PathVariable int roomId) { return ok(service.occupancyLive(roomId)); }
    @PostMapping("/occupancy-demo") public Object occupancyDemo(@PathVariable int roomId,@Valid @RequestBody AiSuggestionService.DemoInput input) {
        return ok(service.occupancyDemo(roomId,input));
    }
    @GetMapping("/history") public Object history(@PathVariable int roomId,@AuthenticationPrincipal CustomUserDetails actor) {
        return ok(service.history(roomId,actor));
    }
    @PostMapping("/analyze") public Object analyze(@PathVariable int roomId,@Valid @RequestBody AiSuggestionService.AnalyzeInput input,
            @AuthenticationPrincipal CustomUserDetails actor) { return ok(service.analyze(roomId,input,actor)); }
}
