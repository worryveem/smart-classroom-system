package iot.iot.service;

import iot.iot.dto.request.*;
import iot.iot.dto.response.*;
import iot.iot.entity.*;
import iot.iot.exception.AdminOperationException;
import iot.iot.repository.UserRepository;
import java.util.List;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static org.springframework.http.HttpStatus.*;

@Service
@PreAuthorize("hasRole('ADMIN')")
@Transactional(readOnly = true)
public class AdminUserService {
    private final UserRepository users;
    private final PasswordEncoder encoder;
    public AdminUserService(UserRepository users, PasswordEncoder encoder) {
        this.users = users;
        this.encoder = encoder;
    }

    public HistoryPageResponse<AdminUserResponse> list(int page, int size, String username) {
        if (username != null && (username.isBlank() || username.length() > 50)) {
            throw new AdminOperationException(BAD_REQUEST, "Invalid username search");
        }
        var pageable = AdminPagination.of(page, size, "id");
        return HistoryPageResponse.from(users.findAll((root, query, cb) -> {
            if (username == null) return cb.conjunction();
            String escaped = username.replace("!", "!!").replace("%", "!%").replace("_", "!_");
            return cb.like(root.get("username"), "%" + escaped + "%", '!');
        }, pageable).map(AdminUserResponse::from));
    }

    public AdminUserResponse get(long id) { return AdminUserResponse.from(require(id)); }

    private User require(long id) {
        return users.findById(id).orElseThrow(() -> new AdminOperationException(NOT_FOUND, "User not found"));
    }

    // Lock the same ordered ADMIN set before every mutation: deletion/demotion cannot race to zero admins.
    private List<User> lockAdmins(long actorId) {
        var admins = users.findByRoleOrderByIdAsc(UserRole.ADMIN);
        if (admins.stream().noneMatch(user -> user.getId().equals(actorId))) throw new AccessDeniedException("Forbidden");
        return admins;
    }

    private void rejectReservedUsername(String username) {
        if (users.matchesReservedCommandActor(username) != 0) {
            throw new AdminOperationException(BAD_REQUEST, "Username RULE_ENGINE is reserved for automatic commands");
        }
    }

    @Transactional
    public AdminUserResponse create(CreateUserRequest request, long actorId) {
        lockAdmins(actorId);
        rejectReservedUsername(request.username());
        if (users.existsByUsername(request.username())) throw new AdminOperationException(CONFLICT, "Username already exists");
        User user = new User();
        user.setUsername(request.username());
        user.setRole(request.role());
        user.setPasswordHash(encoder.encode(request.password()));
        return AdminUserResponse.from(users.saveAndFlush(user));
    }

    @Transactional
    public AdminUserResponse update(long id, UpdateUserRequest request, long actorId) {
        var admins = lockAdmins(actorId);
        User user = require(id);
        rejectReservedUsername(request.username());
        if (users.existsByUsernameAndIdNot(request.username(), id)) throw new AdminOperationException(CONFLICT, "Username already exists");
        if (user.getRole() == UserRole.ADMIN && request.role() != UserRole.ADMIN && admins.size() <= 1) {
            throw new AdminOperationException(CONFLICT, "Cannot demote the last ADMIN");
        }
        user.setUsername(request.username());
        user.setRole(request.role());
        if (request.password() != null && !request.password().isBlank()) user.setPasswordHash(encoder.encode(request.password()));
        return AdminUserResponse.from(users.saveAndFlush(user));
    }

    @Transactional
    public void delete(long id, long actorId) {
        var admins = lockAdmins(actorId);
        User user = require(id);
        if (user.getId().equals(actorId)) throw new AdminOperationException(CONFLICT, "Cannot delete the current account");
        if (user.getRole() == UserRole.ADMIN && admins.size() <= 1) throw new AdminOperationException(CONFLICT, "Cannot delete the last ADMIN");
        users.delete(user);
        users.flush();
    }
}
