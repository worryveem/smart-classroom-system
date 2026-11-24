package iot.iot;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@ActiveProfiles("local")
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@EnabledIfEnvironmentVariable(named = "SMARTCLASS_MYSQL_TEST_URL", matches = ".+")
class HistoryApiIntegrationTests {
    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry props) {
        props.add("spring.datasource.url", () -> MySqlTestSupport.url("_history"));
        props.add("app.jwt.secret", MySqlTestSupport::jwtSecret);
        props.add("debug", () -> false);
    }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    String token;
    List<Map<String, Object>> telemetryBefore;
    List<Map<String, Object>> commandsBefore;

    @BeforeAll
    void fixturesWrittenThroughSharedSqlContractInIsolatedMySqlOnly() throws Exception {
        assertTrue(jdbc.queryForObject("SELECT DATABASE()", String.class).matches("smartclass_verify_[a-zA-Z0-9_]+_history"));
        jdbc.update("INSERT INTO devices(device_id,room_id,type,status) VALUES ('test_sensor',101,'SENSOR','Active'),('test_actuator',101,'ACTUATOR','Active')");
        LocalDateTime start = LocalDateTime.parse("2026-11-01T00:00:00");
        for (int i = 0; i < 105; i++) {
            jdbc.update("INSERT INTO telemetry(device_id,temp,humid,lux,occupancy,`timestamp`) VALUES (?,?,?,?,?,?)",
                "node1_sensor", 20.5 + i, 60.0, 230.0, i % 2, start.plusSeconds(i));
        }
        jdbc.update("INSERT INTO telemetry(device_id,`timestamp`) VALUES ('test_sensor',?)", start.plusSeconds(104));
        for (Object[] values : new Object[][] {
            {"node2_actuator", "FAN", "ON", "RULE_ENGINE", 10},
            {"node2_actuator", "FAN", "OFF", "teacher", 20},
            {"node2_actuator", "LIGHT", "ON", "RULE_ENGINE", 30},
            {"node2_actuator", "FAN", "OFF", "RULE_ENGINE", 40},
            {"test_actuator", "FAN", "ON", "student", 40}}) {
            jdbc.update("INSERT INTO command_logs(device_id,target,action,trigger_by,`timestamp`) VALUES (?,?,?,?,?)",
                values[0], values[1], values[2], values[3], start.plusSeconds((int) values[4]));
        }
        telemetryBefore = jdbc.queryForList("SELECT * FROM telemetry ORDER BY id");
        commandsBefore = jdbc.queryForList("SELECT * FROM command_logs ORDER BY id");
        String login = mvc.perform(post("/api/auth/login").contentType("application/json")
            .content("{\"username\":\"admin\",\"password\":\"Admin@12345\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        token = mapper.readTree(login).path("data").path("accessToken").asText();
        assertFalse(token.isBlank());
    }

    @AfterAll
    void historyQueriesNeverWriteOrModifySharedRows() {
        assertEquals(telemetryBefore, jdbc.queryForList("SELECT * FROM telemetry ORDER BY id"));
        assertEquals(commandsBefore, jdbc.queryForList("SELECT * FROM command_logs ORDER BY id"));
    }

    private JsonNode query(String uri) throws Exception {
        String json = mvc.perform(get(uri).header("Authorization", "Bearer " + token))
            .andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true))
            .andReturn().getResponse().getContentAsString();
        return mapper.readTree(json).path("data");
    }

    @Test
    void telemetryIsBoundedAndOrderedWithStableTimestampTies() throws Exception {
        assertEquals(100, query("/api/telemetry").size());
        JsonNode rows = query("/api/telemetry?limit=3");
        assertEquals(3, rows.size());
        assertEquals("test_sensor", rows.get(0).path("device_id").asText());
        assertEquals("2026-11-01T00:01:44", rows.get(0).path("timestamp").asText());
        assertTrue(rows.get(0).path("id").asLong() > rows.get(1).path("id").asLong());
        assertTrue(rows.get(0).path("temp").isNull());
        assertTrue(rows.get(0).path("occupancy").isNull());
        assertEquals(106, query("/api/telemetry?limit=1000").size());
        assertEquals(105, query("/api/telemetry?deviceId=node1_sensor&limit=1000").size());
        assertEquals(0, query("/api/telemetry?deviceId=unknown").size());
    }

    @Test
    void telemetryReadsSqlWriterValuesAndInclusiveTimeBoundariesExactly() throws Exception {
        JsonNode rows = query("/api/telemetry?deviceId=node1_sensor&from=2026-11-01T00:00:10&to=2026-11-01T00:00:12");
        assertEquals(3, rows.size());
        assertEquals(32.5, rows.get(0).path("temp").asDouble());
        assertEquals(60, rows.get(0).path("humid").asDouble());
        assertEquals(230, rows.get(0).path("lux").asDouble());
        assertFalse(rows.get(0).path("occupancy").asBoolean());
        assertTrue(rows.get(1).path("occupancy").asBoolean());
        assertEquals("2026-11-01T00:00:10", rows.get(2).path("timestamp").asText());
        assertEquals(1, query("/api/telemetry?deviceId=node1_sensor&from=2026-11-01T00:00:10&to=2026-11-01T00:00:10").size());
        assertEquals(2, query("/api/telemetry?from=2026-11-01T00:01:44").size());
        assertEquals(1, query("/api/telemetry?to=2026-11-01T00:00:00").size());
        assertEquals(0, query("/api/telemetry?from=2027-01-01T00:00:00").size());
    }

    @Test
    void commandsHaveTotalsAndStablePageOrdering() throws Exception {
        JsonNode first = query("/api/commands?page=0&size=2");
        assertEquals(5, first.path("totalElements").asInt());
        assertEquals(3, first.path("totalPages").asInt());
        assertEquals(0, first.path("page").asInt());
        assertEquals(2, first.path("size").asInt());
        assertEquals("test_actuator", first.path("content").get(0).path("device_id").asText());
        JsonNode second = query("/api/commands?page=1&size=2");
        assertEquals("LIGHT", second.path("content").get(0).path("target").asText());
        assertEquals(1, query("/api/commands?page=2&size=2").path("content").size());
        JsonNode beyond = query("/api/commands?page=5&size=2");
        assertEquals(0, beyond.path("content").size());
        assertEquals(5, beyond.path("totalElements").asInt());
        assertEquals(20, query("/api/commands").path("size").asInt());
    }

    @Test
    void commandsCombineFiltersForRuleEngineAndUsernameWithoutChangingIdentity() throws Exception {
        JsonNode rules = query("/api/commands?target=FAN&triggerBy=RULE_ENGINE&deviceId=node2_actuator&from=2026-11-01T00:00:10&to=2026-11-01T00:00:40");
        assertEquals(2, rules.path("totalElements").asInt());
        assertEquals("OFF", rules.path("content").get(0).path("action").asText());
        assertEquals("RULE_ENGINE", rules.path("content").get(0).path("trigger_by").asText());
        assertEquals("2026-11-01T00:00:40", rules.path("content").get(0).path("timestamp").asText());
        assertEquals(1, query("/api/commands?triggerBy=teacher").path("totalElements").asInt());
        assertEquals(1, query("/api/commands?to=2026-11-01T00:00:10").path("totalElements").asInt());
        assertEquals(2, query("/api/commands?from=2026-11-01T00:00:40").path("totalElements").asInt());
        assertEquals(0, query("/api/commands?deviceId=unknown").path("totalPages").asInt());
        assertEquals(0, query("/api/commands?target=LIGHT&triggerBy=teacher").path("content").size());
    }

    @Test
    void invalidQueryParametersReturnJson400() throws Exception {
        for (String uri : List.of(
            "/api/telemetry?limit=0", "/api/telemetry?limit=1001", "/api/telemetry?limit=bad",
            "/api/telemetry?deviceId=%20", "/api/telemetry?from=bad", "/api/telemetry?to=2026-11-31T00:00:00",
            "/api/telemetry?from=2026-11-02T00:00:00&to=2026-11-01T00:00:00",
            "/api/commands?from=2026-11-02T00:00:00&to=2026-11-01T00:00:00",
            "/api/commands?target=HEATER", "/api/commands?target=fan", "/api/commands?page=-1",
            "/api/commands?page=2147483647&size=100", "/api/commands?size=0", "/api/commands?size=101",
            "/api/commands?size=2147483648", "/api/commands?from=bad", "/api/commands?triggerBy=%20")) {
            mvc.perform(get(java.net.URI.create(uri)).header("Authorization", "Bearer " + token))
                .andExpect(result -> assertEquals(400, result.getResponse().getStatus(), uri))
                .andExpect(jsonPath("$.success").value(false));
        }
    }

    @Test
    void bothEndpointsRequireAValidJwt() throws Exception {
        for (String uri : List.of("/api/telemetry", "/api/commands")) {
            mvc.perform(get(uri)).andExpect(status().isUnauthorized());
            mvc.perform(get(uri).header("Authorization", "Bearer invalid")).andExpect(status().isUnauthorized());
        }
    }
}
