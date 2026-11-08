package iot.iot.dto.response;

import iot.iot.entity.UserRole;
import iot.iot.security.user.CustomUserDetails;

public record UserResponse(Long id, String username, UserRole role) {
    public static UserResponse from(CustomUserDetails user) {
        return new UserResponse(user.getId(), user.getUsername(), user.getRole());
    }
}
