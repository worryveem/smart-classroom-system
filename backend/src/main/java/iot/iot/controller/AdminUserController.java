package iot.iot.controller;

import iot.iot.common.ApiResponse;
import iot.iot.dto.request.*;
import iot.iot.dto.response.*;
import iot.iot.security.user.CustomUserDetails;
import iot.iot.service.AdminUserService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users")
public class AdminUserController {
    private final AdminUserService service;
    public AdminUserController(AdminUserService service) { this.service = service; }

    @GetMapping
    public ResponseEntity<ApiResponse<HistoryPageResponse<AdminUserResponse>>> list(
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String username) {
        return response(200, "Success", service.list(page, size, username));
    }
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<AdminUserResponse>> get(@PathVariable long id) {
        return response(200, "Success", service.get(id));
    }
    @PostMapping
    public ResponseEntity<ApiResponse<AdminUserResponse>> create(@Valid @RequestBody CreateUserRequest request,
            @AuthenticationPrincipal CustomUserDetails actor) {
        return response(201, "User created", service.create(request, actor.getId()));
    }
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<AdminUserResponse>> update(@PathVariable long id,
            @Valid @RequestBody UpdateUserRequest request, @AuthenticationPrincipal CustomUserDetails actor) {
        return response(200, "User updated", service.update(id, request, actor.getId()));
    }
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable long id, @AuthenticationPrincipal CustomUserDetails actor) {
        service.delete(id, actor.getId());
        return response(200, "User deleted", null);
    }
    private static <T> ResponseEntity<ApiResponse<T>> response(int status, String message, T data) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store").body(ApiResponse.ok(message, data));
    }
}
