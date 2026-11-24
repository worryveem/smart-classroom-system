package iot.iot.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import iot.iot.entity.User;
import iot.iot.entity.UserRole;
import java.time.LocalDateTime;

public record AdminUserResponse(Long id, String username, UserRole role,
        @JsonProperty("created_at") LocalDateTime createdAt) {
    public static AdminUserResponse from(User user) {
        return new AdminUserResponse(user.getId(), user.getUsername(), user.getRole(), user.getCreatedAt());
    }
}
