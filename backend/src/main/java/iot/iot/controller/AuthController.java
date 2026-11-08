package iot.iot.controller;

import iot.iot.common.ApiResponse;
import iot.iot.dto.request.LoginRequest;
import iot.iot.dto.response.LoginResponse;
import iot.iot.dto.response.UserResponse;
import iot.iot.security.user.CustomUserDetails;
import iot.iot.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService auth;
    public AuthController(AuthService auth) { this.auth = auth; }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<LoginResponse>> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .body(ApiResponse.ok("Login successful", auth.login(request)));
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<UserResponse>> me(@AuthenticationPrincipal CustomUserDetails user) {
        // The principal is loaded from MySQL by the filter on this request.
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .body(ApiResponse.ok("Get current user successfully", UserResponse.from(user)));
    }
}
