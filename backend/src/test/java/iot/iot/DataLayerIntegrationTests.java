package iot.iot;

import iot.iot.config.DataSeeder;
import iot.iot.entity.*;
import iot.iot.repository.*;
import java.sql.DriverManager;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named = "SMARTCLASS_MYSQL_TEST_URL", matches = ".+")
class DataLayerIntegrationTests {
    private ConfigurableApplicationContext start(boolean seed, boolean local) {
        return start(seed, local, "");
    }

    private ConfigurableApplicationContext start(boolean seed, boolean local, String suffix) {
        StandardEnvironment env = new StandardEnvironment();
        Map<String, Object> values = new HashMap<>();
        values.put("spring.datasource.url", MySqlTestSupport.url(suffix));
        values.put("app.jwt.secret", MySqlTestSupport.jwtSecret());
        values.put("app.seed.enabled", seed);
        values.put("spring.main.banner-mode", "off");
        values.put("logging.level.root", "WARN");
        values.put("debug", "false");
        env.getPropertySources().addFirst(new MapPropertySource("isolated-mysql-test", values));
        var builder = new SpringApplicationBuilder(IotApplication.class)
            .environment(env).web(WebApplicationType.NONE);
        if (local) builder.profiles("local");
        return builder.run();
    }

    @Test
    void migrationSeederRestartsAndSharedSqlContractWorkOnRealMySql() throws Exception {
        String jdbcUrl = MySqlTestSupport.url("");
        String dbName = jdbcUrl.substring(jdbcUrl.substring(0, jdbcUrl.indexOf('?')).lastIndexOf('/') + 1, jdbcUrl.indexOf('?'));
        String serverUrl = jdbcUrl.substring(0, jdbcUrl.substring(0, jdbcUrl.indexOf('?')).lastIndexOf('/') + 1) + jdbcUrl.substring(jdbcUrl.indexOf('?'));
        try (var conn = DriverManager.getConnection(serverUrl, System.getenv("DB_USERNAME"), System.getenv("DB_PASSWORD"));
             var statement = conn.prepareStatement("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = ?")) {
            statement.setString(1, dbName);
            try (var rows = statement.executeQuery()) { rows.next(); assertEquals(0, rows.getInt(1), "Use a fresh isolated test database"); }
        }
        String originalHash;
        long telemetryId;
        try (var app = start(true, true)) {
            var jdbc = app.getBean(JdbcTemplate.class);
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE version='1' AND success=1", Integer.class));
            assertEquals(4, jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('users','devices','telemetry','command_logs')", Integer.class));
            assertEquals(4, jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('users','devices','telemetry','command_logs') AND engine='InnoDB' AND table_collation='utf8mb4_unicode_ci'", Integer.class));
            for (String table : List.of("users", "devices", "telemetry", "command_logs")) {
                assertFalse(jdbc.queryForList("DESCRIBE " + table).isEmpty());
                assertFalse(jdbc.queryForList("SHOW INDEX FROM " + table + " WHERE Key_name='PRIMARY'").isEmpty());
            }
            assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND delete_rule='RESTRICT' AND update_rule='CASCADE'", Integer.class));
            assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND table_name='command_logs' AND column_name='trigger_by' AND referenced_table_name IS NOT NULL", Integer.class));
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='users' AND index_name='uk_users_username' AND non_unique=0", Integer.class));
            for (String[] index : new String[][] {
                {"telemetry","idx_telemetry_device","device_id"}, {"telemetry","idx_telemetry_timestamp","timestamp"},
                {"telemetry","idx_telemetry_device_timestamp","device_id,timestamp"},
                {"command_logs","idx_command_device","device_id"}, {"command_logs","idx_command_timestamp","timestamp"},
                {"command_logs","idx_command_target","target"}, {"command_logs","idx_command_trigger_by","trigger_by"},
                {"command_logs","idx_command_device_timestamp","device_id,timestamp"},
                {"command_logs","idx_command_target_timestamp","target,timestamp"},
                {"command_logs","idx_command_trigger_timestamp","trigger_by,timestamp"},
                {"command_logs","idx_command_target_trigger_timestamp","target,trigger_by,timestamp"}}) {
                assertEquals(index[2], jdbc.queryForObject("SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name=?", String.class, index[0], index[1]));
            }
            var users = app.getBean(UserRepository.class);
            var devices = app.getBean(DeviceRepository.class);
            assertEquals(3, users.count()); assertEquals(2, devices.count());
            var encoder = app.getBean(BCryptPasswordEncoder.class);
            for (String[] account : new String[][]{{"admin","ADMIN","Admin@12345"},{"teacher","TEACHER","Teacher@12345"},{"student","STUDENT","Student@12345"}}) {
                User user = users.findByUsername(account[0]).orElseThrow();
                assertEquals(account[1], user.getRole().name());
                assertNotEquals(account[2], user.getPasswordHash());
                assertTrue(encoder.matches(account[2], user.getPasswordHash()));
                assertNotNull(user.getCreatedAt());
            }
            assertEquals(DeviceStatus.ACTIVE, devices.findByDeviceId("node1_sensor").orElseThrow().getStatus());
            assertEquals(DeviceType.ACTUATOR, devices.findByDeviceId("node2_actuator").orElseThrow().getType());
            assertEquals(101, devices.findByDeviceId("node1_sensor").orElseThrow().getRoomId());
            jdbc.update("INSERT INTO telemetry (device_id, temp, humid, lux, occupancy) VALUES ('node1_sensor', 29.5, 71.0, 230, 1)");
            jdbc.update("INSERT INTO command_logs (device_id, target, action, trigger_by) VALUES ('node2_actuator', 'FAN', 'ON', 'RULE_ENGINE')");
            telemetryId = jdbc.queryForObject("SELECT MAX(id) FROM telemetry", Long.class);
            var telemetry = app.getBean(TelemetryRepository.class);
            var commands = app.getBean(CommandLogRepository.class);
            var from = LocalDateTime.now(java.time.ZoneId.of("Asia/Ho_Chi_Minh")).minusHours(1);
            var to = from.plusHours(2);
            new TransactionTemplate(app.getBean(PlatformTransactionManager.class)).executeWithoutResult(tx -> {
                Telemetry row = telemetry.findFirstByDevice_DeviceIdOrderByTimestampDescIdDesc("node1_sensor").orElseThrow();
                assertEquals(29.5, row.getTemp()); assertEquals(71.0, row.getHumid()); assertEquals(230.0, row.getLux());
                assertEquals(Boolean.TRUE, row.getOccupancy()); assertNotNull(row.getTimestamp());
                assertEquals("node1_sensor", row.getDevice().getDeviceId());
                assertTrue(row.getTimestamp().isAfter(from) && row.getTimestamp().isBefore(to));
                assertEquals(1, telemetry.findByDevice_DeviceIdOrderByTimestampDescIdDesc("node1_sensor").size());
                assertEquals(1, telemetry.findByTimestampBetweenOrderByTimestampDescIdDesc(from, to).size());
                assertEquals(1, telemetry.findByDevice_DeviceIdAndTimestampBetweenOrderByTimestampDescIdDesc("node1_sensor", from, to).size());
                assertTrue(telemetry.findFirstByOrderByTimestampDescIdDesc().isPresent());
                CommandLog log = commands.findByDevice_DeviceIdOrderByTimestampDescIdDesc("node2_actuator").get(0);
                assertEquals("FAN", log.getTarget()); assertEquals("ON", log.getAction()); assertEquals("RULE_ENGINE", log.getTriggerBy());
                assertNotNull(log.getTimestamp());
                assertEquals(1, commands.findByTargetOrderByTimestampDescIdDesc("FAN").size());
                assertEquals(1, commands.findByTriggerByOrderByTimestampDescIdDesc("RULE_ENGINE").size());
                assertEquals(1, commands.findByTimestampBetweenOrderByTimestampDescIdDesc(from,to).size());
                assertEquals(1, commands.findByTargetAndTriggerByAndTimestampBetweenOrderByTimestampDescIdDesc("FAN","RULE_ENGINE",from,to).size());
                CommandLog bffLog = new CommandLog(); bffLog.setDevice(devices.getReferenceById("node2_actuator"));
                bffLog.setTarget("LIGHT"); bffLog.setAction("OFF"); bffLog.setTriggerBy("admin");
                commands.saveAndFlush(bffLog); assertNotNull(bffLog.getTimestamp());
            });
            jdbc.update("INSERT INTO telemetry (device_id) VALUES ('node1_sensor')");
            Telemetry missing = telemetry.findFirstByOrderByTimestampDescIdDesc().orElseThrow();
            assertNull(missing.getTemp()); assertNull(missing.getHumid()); assertNull(missing.getLux()); assertNull(missing.getOccupancy());
            jdbc.update("INSERT INTO telemetry (device_id,occupancy) VALUES ('node1_sensor',0)");
            assertEquals(Boolean.FALSE, telemetry.findFirstByOrderByTimestampDescIdDesc().orElseThrow().getOccupancy());
            assertThrows(DataIntegrityViolationException.class, () -> jdbc.update("DELETE FROM devices WHERE device_id='node1_sensor'"));
            assertThrows(DataIntegrityViolationException.class, () -> jdbc.update("DELETE FROM devices WHERE device_id='node2_actuator'"));
            assertThrows(DataIntegrityViolationException.class, () -> jdbc.update("INSERT INTO telemetry (device_id) VALUES ('missing_device')"));
            assertThrows(DataIntegrityViolationException.class, () -> jdbc.update("INSERT INTO command_logs (device_id,target,action,trigger_by) VALUES ('missing_device','FAN','ON','RULE_ENGINE')"));
            assertThrows(DataIntegrityViolationException.class, () -> jdbc.update("INSERT INTO users(username,password_hash,role) SELECT username,password_hash,role FROM users WHERE username='admin'"));
            jdbc.update("UPDATE devices SET device_id='node1_renamed' WHERE device_id='node1_sensor'");
            assertEquals(3, jdbc.queryForObject("SELECT COUNT(*) FROM telemetry WHERE device_id='node1_renamed'", Integer.class));
            jdbc.update("UPDATE devices SET device_id='node1_sensor', room_id=202, status='Suspended', mac_address='AA:BB:CC:DD:EE:FF' WHERE device_id='node1_renamed'");
            originalHash = encoder.encode("ChangedByAdministrator!");
            jdbc.update("UPDATE users SET password_hash=? WHERE username='admin'", originalHash);
        }
        // A second full application startup: Flyway validates and seeder skips existing rows.
        try (var app = start(true, true)) {
            var users = app.getBean(UserRepository.class);
            var devices = app.getBean(DeviceRepository.class);
            assertEquals(3, users.count()); assertEquals(2, devices.count());
            assertEquals(originalHash, users.findByUsername("admin").orElseThrow().getPasswordHash());
            Device sensor = devices.findByDeviceId("node1_sensor").orElseThrow();
            assertEquals(202, sensor.getRoomId()); assertEquals(DeviceStatus.SUSPENDED, sensor.getStatus());
            assertEquals("AA:BB:CC:DD:EE:FF", sensor.getMacAddress());
            assertTrue(app.getBean(TelemetryRepository.class).findById(telemetryId).isPresent());
            assertEquals(3, app.getBean(TelemetryRepository.class).count());
            assertEquals(2, app.getBean(CommandLogRepository.class).count());
        }
        // Disabled seeder still allows the whole application and JPA to start.
        try (var app = start(false, false, "_disabled")) {
            assertTrue(app.getBeansOfType(DataSeeder.class).isEmpty());
            assertEquals(0, app.getBean(UserRepository.class).count());
            assertEquals(0, app.getBean(DeviceRepository.class).count());
        }
    }
}
