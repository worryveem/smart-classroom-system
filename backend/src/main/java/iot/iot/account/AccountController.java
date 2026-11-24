package iot.iot.account;

import iot.iot.common.ApiResponse;
import iot.iot.security.user.CustomUserDetails;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/account")
public class AccountController {
    private final AccountService service;
    public AccountController(AccountService service) { this.service=service; }
    private Object ok(Object data,String message) { return ResponseEntity.ok().header("Cache-Control","no-store").body(ApiResponse.ok(message,data)); }
    @GetMapping("/profile") public Object get(@AuthenticationPrincipal CustomUserDetails actor) { return ok(service.get(actor),"Thông tin tài khoản của bạn"); }
    @PutMapping("/profile") public Object update(@Valid @RequestBody AccountRequests.Profile input,@AuthenticationPrincipal CustomUserDetails actor) { return ok(service.update(input,actor),"Đã lưu thông tin cá nhân"); }
    @PostMapping("/password") public Object password(@Valid @RequestBody AccountRequests.Password input,@AuthenticationPrincipal CustomUserDetails actor) { service.changePassword(input,actor); return ok(null,"Đã đổi mật khẩu. Vui lòng đăng nhập lại."); }
}
