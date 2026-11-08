package iot.iot.config;

import iot.iot.entity.*;
import iot.iot.repository.DeviceRepository;
import iot.iot.repository.UserRepository;
import java.nio.charset.StandardCharsets;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@ConditionalOnProperty(prefix = "app.seed", name = "enabled", havingValue = "true")
@EnableConfigurationProperties(SeedProperties.class)
public class DataSeeder implements CommandLineRunner {
    private final UserRepository users;
    private final DeviceRepository devices;
    private final BCryptPasswordEncoder encoder;
    private final SeedProperties properties;

    public DataSeeder(UserRepository users, DeviceRepository devices,
                      BCryptPasswordEncoder encoder, SeedProperties properties) {
        this.users = users;
        this.devices = devices;
        this.encoder = encoder;
        this.properties = properties;
    }

    @Override
    @Transactional
    public void run(String... args) {
        seedDevice("node1_sensor", DeviceType.SENSOR);
        seedDevice("node2_actuator", DeviceType.ACTUATOR);
        seedUser("admin", UserRole.ADMIN, properties.getAdminPassword());
        seedUser("teacher", UserRole.TEACHER, properties.getTeacherPassword());
        seedUser("student", UserRole.STUDENT, properties.getStudentPassword());
    }

    private void seedDevice(String id, DeviceType type) {
        if (devices.existsByDeviceId(id)) return;
        Device device = new Device();
        device.setDeviceId(id);
        device.setRoomId(101);
        device.setType(type);
        device.setStatus(DeviceStatus.ACTIVE);
        devices.save(device);
    }

    private void seedUser(String username, UserRole role, String password) {
        if (users.existsByUsername(username)) return;
        if (password == null || password.isBlank() || password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new IllegalStateException("Provide a nonblank seed password of at most 72 UTF-8 bytes for " + username);
        }
        User user = new User();
        user.setUsername(username);
        user.setRole(role);
        user.setPasswordHash(encoder.encode(password));
        users.save(user);
    }
}
