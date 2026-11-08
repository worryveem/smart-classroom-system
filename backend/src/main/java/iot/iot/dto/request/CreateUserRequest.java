package iot.iot.dto.request;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import iot.iot.entity.UserRole;
import jakarta.validation.constraints.*;
import java.nio.charset.StandardCharsets;

public record CreateUserRequest(
        @NotBlank @Size(max = 50) @Pattern(regexp = "\\S+") String username,
        @NotBlank @Size(min = 8, max = 72) String password,
        @NotNull UserRole role) {
    @AssertTrue public boolean isPasswordLengthValid() {
        return password == null || password.getBytes(StandardCharsets.UTF_8).length <= 72;
    }
    @JsonAnySetter public void rejectUnknown(String name, Object value) {
        throw new IllegalArgumentException("Unknown request field");
    }
    @Override public String toString() { return "CreateUserRequest[redacted]"; }
}
