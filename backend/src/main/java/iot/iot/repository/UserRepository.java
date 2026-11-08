package iot.iot.repository;

import iot.iot.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long>, org.springframework.data.jpa.repository.JpaSpecificationExecutor<User> {
    Optional<User> findByUsername(String username);
    boolean existsByUsername(String username);
    boolean existsByUsernameAndIdNot(String username, Long id);

    // Use the same comparison rules as users.username / command_logs.trigger_by, including accents and width.
    @org.springframework.data.jpa.repository.Query(value = "SELECT CONVERT(:username USING utf8mb4) COLLATE utf8mb4_unicode_ci = _utf8mb4'RULE_ENGINE' COLLATE utf8mb4_unicode_ci", nativeQuery = true)
    int matchesReservedCommandActor(@org.springframework.data.repository.query.Param("username") String username);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    java.util.List<User> findByRoleOrderByIdAsc(iot.iot.entity.UserRole role);
}
