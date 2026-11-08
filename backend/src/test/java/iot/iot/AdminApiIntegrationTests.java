package iot.iot;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

@SpringBootTest
@ActiveProfiles("local")
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@EnabledIfEnvironmentVariable(named = "SMARTCLASS_MYSQL_TEST_URL", matches = ".+")
class AdminApiIntegrationTests {
    @DynamicPropertySource static void properties(DynamicPropertyRegistry props) {
        props.add("spring.datasource.url", () -> MySqlTestSupport.url("_admin"));
        props.add("app.jwt.secret", MySqlTestSupport::jwtSecret);
        props.add("logging.level.root", () -> "WARN");
        props.add("debug", () -> false);
    }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder encoder;
    String admin;
    String teacher;
    String student;
    long adminId;

    private JsonNode call(MockHttpServletRequestBuilder req, String token, Object body, int expected) throws Exception {
        if (token != null) req.header("Authorization", "Bearer " + token);
        if (body != null) req.contentType("application/json").content(body instanceof String text ? text : mapper.writeValueAsString(body));
        var response = mvc.perform(req).andReturn().getResponse();
        assertEquals(expected, response.getStatus(), "Unexpected HTTP status");
        String json = response.getContentAsString();
        assertFalse(json.contains("password_hash"));
        assertFalse(json.contains("passwordHash"));
        assertFalse(json.contains("$2a$"));
        assertFalse(json.contains("$2b$"));
        return mapper.readTree(json);
    }
    private String login(String username, String password) throws Exception {
        return call(post("/api/auth/login"), null, Map.of("username", username, "password", password), 200)
            .path("data").path("accessToken").asText();
    }
    private Map<String, Object> newUser(String name, String role) {
        return Map.of("username", name, "password", "Password@123", "role", role);
    }
    private Map<String, Object> device(String id, String status) {
        return Map.of("deviceId", id, "roomId", 601, "type", "SENSOR", "macAddress", "AA:BB:CC:DD:EE:FF", "status", status);
    }
    @BeforeAll void setup() throws Exception {
        assertTrue(jdbc.queryForObject("SELECT DATABASE()", String.class).matches("smartclass_verify_[a-zA-Z0-9_]+_admin"));
        admin = login("admin", "Admin@12345");
        teacher = login("teacher", "Teacher@12345");
        student = login("student", "Student@12345");
        adminId = jdbc.queryForObject("SELECT id FROM users WHERE username='admin'", Long.class);
    }

    @Test void allAdminEndpointsRejectAnonymousInvalidJwtTeacherAndStudent() throws Exception {
        for (String token : Arrays.asList(null, "invalid", teacher, student)) {
            int status = token == null || token.equals("invalid") ? 401 : 403;
            for (String path : List.of("/api/users", "/api/devices")) {
                call(get(path), token, null, status);
                call(get(path + "/999999"), token, null, status);
                call(post(path), token, "{}", status);
                call(put(path + "/999999"), token, "{}", status);
                call(delete(path + "/999999"), token, null, status);
            }
        }
    }

    @Test void userCrudHashesPasswordsAndPreservesOmittedOrBlankPassword() throws Exception {
        JsonNode created = call(post("/api/users"), admin, newUser("crud_teacher", "TEACHER"), 201).path("data");
        long id = created.path("id").asLong();
        assertFalse(created.path("created_at").asText().isBlank());
        assertEquals(4, created.size());
        String hash = jdbc.queryForObject("SELECT password_hash FROM users WHERE id=?", String.class, id);
        assertTrue(encoder.matches("Password@123", hash));
        assertTrue(hash.startsWith("$2"));
        String oldToken = login("crud_teacher", "Password@123");
        call(post("/api/users"), admin, newUser("CRUD_TEACHER", "STUDENT"), 409);
        call(get("/api/users/" + id), admin, null, 200);
        call(put("/api/users/" + id), admin, Map.of("username", "crud_teacher", "role", "STUDENT"), 200);
        assertEquals(hash, jdbc.queryForObject("SELECT password_hash FROM users WHERE id=?", String.class, id));
        call(put("/api/users/" + id), admin, Map.of("username", "crud_teacher", "role", "STUDENT", "password", " "), 200);
        assertEquals(hash, jdbc.queryForObject("SELECT password_hash FROM users WHERE id=?", String.class, id));
        call(put("/api/users/" + id), admin, Map.of("username", "teacher", "role", "STUDENT"), 409);
        call(put("/api/users/" + id), admin, Map.of("username", "crud_teacher_renamed", "role", "STUDENT", "password", "NewPassword@123"), 200);
        assertTrue(encoder.matches("NewPassword@123", jdbc.queryForObject("SELECT password_hash FROM users WHERE id=?", String.class, id)));
        call(get("/api/auth/me"), oldToken, null, 401);
        call(post("/api/users"), admin, newUser("crud_teacher", "ADMIN"), 201);
        // Reusing an old username must not turn its former JWT into an ADMIN token.
        call(get("/api/users"), oldToken, null, 401);
        String renamedToken = login("crud_teacher_renamed", "NewPassword@123");
        call(delete("/api/users/" + id), admin, null, 200);
        call(get("/api/auth/me"), renamedToken, null, 401);
        call(get("/api/users/" + id), admin, null, 404);
        call(delete("/api/users/" + id), admin, null, 404);
        long reused = jdbc.queryForObject("SELECT id FROM users WHERE username='crud_teacher'", Long.class);
        call(delete("/api/users/" + reused), admin, null, 200);
    }

    @Test void userSearchPaginationAndMissingRecords() throws Exception {
        JsonNode page = call(get("/api/users").param("username", "teacher").param("size", "1"), admin, null, 200).path("data");
        assertTrue(page.path("totalElements").asLong() >= 1);
        assertEquals(1, page.path("content").size());
        assertEquals(1, page.path("size").asInt());
        assertEquals(0, call(get("/api/users").param("username", "%"), admin, null, 200).path("data").path("totalElements").asInt());
        assertEquals(0, call(get("/api/users").param("page", "999"), admin, null, 200).path("data").path("content").size());
        call(get("/api/users/99999999"), admin, null, 404);
        call(put("/api/users/99999999"), admin, Map.of("username", "missing", "role", "STUDENT"), 404);
    }

    @Test void userValidationNeverEchoesPasswordOrAcceptsActorSpoofing() throws Exception {
        for (String body : List.of("{}",
            "{\"username\":\"bad\",\"password\":\"short\",\"role\":\"TEACHER\"}",
            "{\"username\":\"bad\",\"password\":\"Password@123\",\"role\":\"SUPERUSER\"}",
            "{\"username\":\"bad\",\"password\":\"Password@123\",\"role\":0}",
            "{\"username\":\"bad name\",\"password\":\"Password@123\",\"role\":\"TEACHER\"}",
            "{\"username\":\"bad\",\"password\":\"Password@123\",\"role\":\"TEACHER\",\"actorId\":1}")) {
            JsonNode error = call(post("/api/users"), admin, body, 400);
            assertFalse(error.toString().contains("Password@123"));
        }
        call(post("/api/users"), admin, Map.of("username", "unicode_password", "password", "\u00e9".repeat(37), "role", "STUDENT"), 400);
        call(put("/api/users/" + adminId), admin, Map.of("username", "admin", "role", "ADMIN", "password", "short"), 400);
        for (String path : List.of("/api/users?page=-1", "/api/users?size=101", "/api/users?size=bad", "/api/users?page=2147483647&size=100")) {
            call(get(path), admin, null, 400);
        }
    }

    @Test void currentAdminCannotDeleteSelfOrDemoteLastAdmin() throws Exception {
        call(delete("/api/users/" + adminId), admin, null, 409);
        call(put("/api/users/" + adminId), admin, Map.of("username", "admin", "role", "STUDENT"), 409);
        assertEquals("ADMIN", jdbc.queryForObject("SELECT role FROM users WHERE id=?", String.class, adminId));
    }

    @Test void ruleEngineUsernameCannotBeCreatedOrAssignedUnderDatabaseCollation() throws Exception {
        var beforeUsers = jdbc.queryForList("SELECT * FROM users ORDER BY id");
        var beforeLogs = jdbc.queryForList("SELECT * FROM command_logs ORDER BY id");
        long teacherId = jdbc.queryForObject("SELECT id FROM users WHERE username='teacher'", Long.class);
        for (String reserved : List.of("RULE_ENGINE", "rule_engine", "R\u00daLE_ENGINE", "\uff32\uff35\uff2c\uff25_\uff25\uff2e\uff27\uff29\uff2e\uff25")) {
            var created = call(post("/api/users"), admin, newUser(reserved, "TEACHER"), 400);
            assertEquals("Username RULE_ENGINE is reserved for automatic commands", created.path("message").asText());
            var updated = call(put("/api/users/" + teacherId), admin, Map.of("username", reserved, "role", "TEACHER"), 400);
            assertEquals("Username RULE_ENGINE is reserved for automatic commands", updated.path("message").asText());
        }
        assertEquals(beforeUsers, jdbc.queryForList("SELECT * FROM users ORDER BY id"));
        assertEquals(beforeLogs, jdbc.queryForList("SELECT * FROM command_logs ORDER BY id"));
    }

    @Test void legacyReservedActorCannotMasqueradeAsAutomaticCommandHistory() throws Exception {
        // The isolated database deliberately models an account that existed before this validation.
        String reserved = "R\u00daLE_ENGINE";
        jdbc.update("INSERT INTO users(username,password_hash,role) VALUES (?,?,?)", reserved, encoder.encode("Legacy@12345"), "TEACHER");
        var beforeLogs = jdbc.queryForList("SELECT * FROM command_logs ORDER BY id");
        try {
            String token = login(reserved, "Legacy@12345");
            var response = call(post("/api/control"), token, Map.of("target", "FAN", "action", "ON"), 403);
            assertEquals("Username RULE_ENGINE is reserved for automatic commands", response.path("message").asText());
            assertEquals(beforeLogs, jdbc.queryForList("SELECT * FROM command_logs ORDER BY id"));
        } finally {
            jdbc.update("DELETE FROM users WHERE username=?", reserved);
        }
    }

    @Test void deviceCrudFiltersAndDatabaseEnumMapping() throws Exception {
        JsonNode created = call(post("/api/devices"), admin, device("crud_sensor", "ACTIVE"), 201).path("data");
        assertEquals("crud_sensor", created.path("device_id").asText());
        assertEquals(601, created.path("room_id").asInt());
        assertEquals("ACTIVE", created.path("status").asText());
        assertEquals("Active", jdbc.queryForObject("SELECT status FROM devices WHERE device_id='crud_sensor'", String.class));
        assertEquals(6, created.size());
        call(post("/api/devices"), admin, device("CRUD_SENSOR", "Offline"), 409);
        call(get("/api/devices/crud_sensor"), admin, null, 200);
        JsonNode filtered = call(get("/api/devices").param("room_id", "601").param("type", "SENSOR").param("status", "Active").param("size", "1"), admin, null, 200).path("data");
        assertEquals(1, filtered.path("totalElements").asInt());
        assertEquals(1, filtered.path("totalPages").asInt());
        call(put("/api/devices/crud_sensor"), admin, Map.of("roomId", 602, "type", "ACTUATOR", "status", "Suspended"), 200);
        assertEquals("Suspended", jdbc.queryForObject("SELECT status FROM devices WHERE device_id='crud_sensor'", String.class));
        assertNull(jdbc.queryForObject("SELECT mac_address FROM devices WHERE device_id='crud_sensor'", String.class));
        call(put("/api/devices/crud_sensor"), admin, Map.of("roomId", 602, "type", "ACTUATOR", "status", "OFFLINE"), 200);
        assertEquals("Offline", jdbc.queryForObject("SELECT status FROM devices WHERE device_id='crud_sensor'", String.class));
        assertEquals(1, call(get("/api/devices").param("roomId", "602").param("status", "OFFLINE"), admin, null, 200).path("data").path("content").size());
        call(delete("/api/devices/crud_sensor"), admin, null, 200);
        call(get("/api/devices/crud_sensor"), admin, null, 404);
        call(delete("/api/devices/crud_sensor"), admin, null, 404);
        assertEquals(0, call(get("/api/devices").param("roomId", "602"), admin, null, 200).path("data").path("totalElements").asInt());
    }

    @Test void deviceValidationAndImmutableDeviceId() throws Exception {
        for (var change : List.of(Map.of("status", "UNKNOWN"), Map.of("status", "active"),
            Map.of("type", "UNKNOWN"), Map.of("roomId", 0), Map.of("macAddress", "invalid"), Map.of("deviceId", "bad id"))) {
            var body = new HashMap<>(device("invalid_sensor", "Active"));
            body.putAll(change);
            call(post("/api/devices"), admin, body, 400);
        }
        call(post("/api/devices"), admin, "{}", 400);
        var numericType = new HashMap<>(device("invalid_numeric", "ACTIVE"));
        numericType.put("type", 0);
        call(post("/api/devices"), admin, numericType, 400);
        call(put("/api/devices/node1_sensor"), admin, Map.of("deviceId", "renamed", "roomId", 101, "type", "SENSOR", "status", "ACTIVE"), 400);
        call(put("/api/devices/missing"), admin, Map.of("roomId", 101, "type", "SENSOR", "status", "ACTIVE"), 404);
        for (String path : List.of("/api/devices?status=invalid", "/api/devices?type=bad", "/api/devices?roomId=0",
            "/api/devices?roomId=101&room_id=102", "/api/devices?size=0", "/api/devices?page=-1")) {
            call(get(path), admin, null, 400);
        }
    }

    @Test void deviceForeignKeyConflictsPreserveTelemetryAndCommands() throws Exception {
        for (String id : List.of("referenced_sensor", "referenced_actuator")) call(post("/api/devices"), admin, device(id, "Active"), 201);
        jdbc.update("INSERT INTO telemetry(device_id,temp) VALUES ('referenced_sensor',29.5)");
        jdbc.update("INSERT INTO command_logs(device_id,target,action,trigger_by) VALUES ('referenced_actuator','FAN','ON','RULE_ENGINE')");
        var telemetry = jdbc.queryForList("SELECT * FROM telemetry");
        var commands = jdbc.queryForList("SELECT * FROM command_logs");
        call(delete("/api/devices/referenced_sensor"), admin, null, 409);
        call(delete("/api/devices/referenced_actuator"), admin, null, 409);
        assertEquals(telemetry, jdbc.queryForList("SELECT * FROM telemetry"));
        assertEquals(commands, jdbc.queryForList("SELECT * FROM command_logs"));
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM devices WHERE device_id IN ('referenced_sensor','referenced_actuator')", Integer.class));
    }

    @Test void concurrentSelfDemotionsCannotRemoveEveryAdmin() throws Exception {
        long backupId = call(post("/api/users"), admin, newUser("concurrent_admin", "ADMIN"), 201).path("data").path("id").asLong();
        String backup = login("concurrent_admin", "Password@123");
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2), start = new CountDownLatch(1);
        try {
            List<Future<Integer>> futures = new ArrayList<>();
            for (var entry : List.of(Map.entry(adminId, admin), Map.entry(backupId, backup))) {
                futures.add(executor.submit(() -> {
                    ready.countDown();
                    assertTrue(start.await(5, TimeUnit.SECONDS));
                    String name = entry.getKey() == adminId ? "admin" : "concurrent_admin";
                    return mvc.perform(put("/api/users/" + entry.getKey()).header("Authorization", "Bearer " + entry.getValue())
                        .contentType("application/json").content(mapper.writeValueAsString(Map.of("username", name, "role", "STUDENT"))))
                        .andReturn().getResponse().getStatus();
                }));
            }
            assertTrue(ready.await(5, TimeUnit.SECONDS)); start.countDown();
            var statuses = new ArrayList<Integer>();
            for (var future : futures) statuses.add(future.get(15, TimeUnit.SECONDS));
            assertEquals(1, statuses.stream().filter(code -> code == 200).count(), statuses.toString());
            assertTrue(statuses.stream().allMatch(code -> code == 200 || code == 403 || code == 409), statuses.toString());
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE role='ADMIN'", Integer.class));
        } finally {
            start.countDown(); executor.shutdownNow();
            assertTrue(executor.awaitTermination(5, TimeUnit.SECONDS));
            jdbc.update("UPDATE users SET role='ADMIN' WHERE id=?", adminId);
            jdbc.update("DELETE FROM users WHERE id=?", backupId);
        }
    }
}
