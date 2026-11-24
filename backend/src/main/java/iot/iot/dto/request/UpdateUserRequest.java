package iot.iot.dto.request;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import iot.iot.entity.UserRole;
import jakarta.validation.constraints.*;
import java.nio.charset.StandardCharsets;

public record UpdateUserRequest(
        @NotBlank @Size(max = 50) @Pattern(regexp = "\\S+") String username,
        @NotNull UserRole role,
        @Size(max = 72) String password) {
    @AssertTrue public boolean isPasswordLengthValid() {
        return password == null || password.isBlank()
            || (password.length() >= 8 && password.getBytes(StandardCharsets.UTF_8).length <= 72);
    }
    @JsonAnySetter public void rejectUnknown(String name, Object value) {
        throw new IllegalArgumentException("Unknown request field");
    }
    @Override public String toString() { return "UpdateUserRequest[redacted]"; }
}
