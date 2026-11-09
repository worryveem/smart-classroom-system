package iot.iot.account;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import jakarta.validation.constraints.*;
import java.nio.charset.StandardCharsets;

public final class AccountRequests {
    private AccountRequests() {}
    public record Profile(
        @NotNull @Size(max=100) @Pattern(regexp="[^\\p{Cntrl}]*") String fullName,
        @NotNull @Email @Size(max=254) String email,
        @NotNull @Size(max=30) String phone) {
        public Profile { fullName=fullName==null?null:fullName.trim(); email=email==null?null:email.trim(); phone=phone==null?null:phone.trim(); }
        @AssertTrue public boolean isPhoneValid() { return phone==null || phone.isEmpty() || phone.replaceAll("[\\s().-]","").matches("\\+?[0-9]{7,15}"); }
        @JsonAnySetter public void rejectUnknown(String name,Object value) { throw new IllegalArgumentException("Unknown profile field"); }
        @Override public String toString() { return "Profile[redacted]"; }
    }
    public record Password(@NotBlank @Size(max=72) String currentPassword,@NotBlank @Size(min=8,max=72) String newPassword) {
        @AssertTrue public boolean isPasswordLengthValid() {
            return currentPassword==null || newPassword==null || (currentPassword.getBytes(StandardCharsets.UTF_8).length<=72 && newPassword.getBytes(StandardCharsets.UTF_8).length<=72);
        }
        @JsonAnySetter public void rejectUnknown(String name,Object value) { throw new IllegalArgumentException("Unknown password field"); }
        @Override public String toString() { return "Password[redacted]"; }
    }
}
