package iot.iot.account;

import iot.iot.entity.User;
import iot.iot.entity.UserRole;
import iot.iot.exception.AdminOperationException;
import iot.iot.repository.UserRepository;
import iot.iot.security.user.CustomUserDetails;
import java.time.LocalDateTime;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static org.springframework.http.HttpStatus.*;

@Service
@Transactional(readOnly=true)
public class AccountService {
    private final UserRepository users;
    private final PasswordEncoder encoder;
    public AccountService(UserRepository users,PasswordEncoder encoder) { this.users=users;this.encoder=encoder; }
    public record ProfileView(Long id,String username,UserRole role,String fullName,String email,String phone,LocalDateTime createdAt) {
        static ProfileView from(User user) { return new ProfileView(user.getId(),user.getUsername(),user.getRole(),user.getFullName(),user.getEmail(),user.getPhone(),user.getCreatedAt()); }
    }
    public ProfileView get(CustomUserDetails actor) { return ProfileView.from(users.findById(actor.getId()).orElseThrow(()->new AdminOperationException(NOT_FOUND,"Không tìm thấy tài khoản"))); }
    private User lock(CustomUserDetails actor) {
        var user=users.findByIdForUpdate(actor.getId()).orElseThrow(()->new AdminOperationException(NOT_FOUND,"Không tìm thấy tài khoản"));
        if(user.getCredentialsVersion()!=actor.getCredentialsVersion()) throw new AdminOperationException(CONFLICT,"Thông tin đăng nhập đã thay đổi. Vui lòng đăng nhập lại.");
        return user;
    }
    @Transactional
    public ProfileView update(AccountRequests.Profile input,CustomUserDetails actor) {
        var user=lock(actor);
        user.setFullName(input.fullName()); user.setEmail(input.email()); user.setPhone(input.phone());
        users.flush(); return ProfileView.from(user);
    }
    @Transactional
    public void changePassword(AccountRequests.Password input,CustomUserDetails actor) {
        var user=lock(actor);
        if(!encoder.matches(input.currentPassword(),user.getPasswordHash())) throw new AdminOperationException(BAD_REQUEST,"Mật khẩu hiện tại không đúng.");
        if(encoder.matches(input.newPassword(),user.getPasswordHash())) throw new AdminOperationException(BAD_REQUEST,"Mật khẩu mới phải khác mật khẩu hiện tại.");
        user.setPasswordHash(encoder.encode(input.newPassword())); user.invalidateCredentials(); users.flush();
    }
}
