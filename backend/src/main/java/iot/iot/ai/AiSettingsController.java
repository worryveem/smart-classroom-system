package iot.iot.ai;

import iot.iot.common.ApiResponse;
import iot.iot.security.user.CustomUserDetails;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/ai/settings")
@PreAuthorize("hasAnyRole('ADMIN','TEACHER')")
public class AiSettingsController {
    private final JdbcTemplate db;
    public AiSettingsController(JdbcTemplate db) { this.db = db; }
    public record SettingsInput(@NotNull Boolean enabled) {}

    private ResponseEntity<?> response(boolean enabled) {
        return ResponseEntity.ok().header("Cache-Control", "no-store").body(ApiResponse.ok(
            "Cấu hình gợi ý AI", Map.of("enabled", enabled, "executionStatus", "AWAITING_INTEGRATION")));
    }

    @GetMapping
    public ResponseEntity<?> get(@AuthenticationPrincipal CustomUserDetails actor) {
        var rows = db.query("SELECT enabled FROM ai_suggestion_preferences WHERE user_id=?",
            (rs, index) -> rs.getBoolean("enabled"), actor.getId());
        return response(!rows.isEmpty() && rows.get(0));
    }

    @PutMapping
    public ResponseEntity<?> put(@Valid @RequestBody SettingsInput input,
            @AuthenticationPrincipal CustomUserDetails actor) {
        db.update("INSERT INTO ai_suggestion_preferences(user_id,enabled) VALUES (?,?) "
            + "ON DUPLICATE KEY UPDATE enabled=?,updated_at=CURRENT_TIMESTAMP",
            actor.getId(), input.enabled(), input.enabled());
        return response(input.enabled());
    }
}
