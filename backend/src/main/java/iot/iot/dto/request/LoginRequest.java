package iot.iot.dto.request;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.nio.charset.StandardCharsets;

public record LoginRequest(
    @NotBlank @Size(max = 50) String username,
    @NotBlank @Size(max = 72) String password
) {
    @AssertTrue(message = "Password must be at most 72 UTF-8 bytes")
    public boolean isPasswordLengthValid() {
        return password == null || password.getBytes(StandardCharsets.UTF_8).length <= 72;
    }
    @Override
    public String toString() { return "LoginRequest[redacted]"; }
}
