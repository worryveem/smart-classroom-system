package iot.iot;

import com.fasterxml.jackson.databind.ObjectMapper;
import iot.iot.dto.*;
import iot.iot.dto.request.ControlRequest;
import iot.iot.service.ControlService;
import java.util.List;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
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
import org.springframework.transaction.support.TransactionSynchronizationManager;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@ActiveProfiles("local")
@AutoConfigureMockMvc(print=MockMvcPrint.NONE)
@EnabledIfEnvironmentVariable(named="SMARTCLASS_MYSQL_TEST_URL",matches=".+")
class NodeRedApiIntegrationTests {
    static final NodeRedStub STUB=new NodeRedStub();
    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry props) {
        props.add("spring.datasource.url",()->MySqlTestSupport.url("_nodered"));
        props.add("app.jwt.secret",MySqlTestSupport::jwtSecret);
        props.add("app.nodered.base-url",STUB::baseUrl);
        props.add("app.nodered.command-path",()->"/smarthome/api/command");
        props.add("app.nodered.connect-timeout",()->500);
        props.add("app.nodered.read-timeout",()->1000);
        props.add("debug",()->false);
    }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean
    iot.iot.integration.nodered.NodeRedClient nodeRed;

    @AfterAll static void cleanup() { STUB.close(); }
    private long logCount() { return jdbc.queryForObject("SELECT COUNT(*) FROM command_logs",Long.class); }
    private void sendControl(String token,String body,int expected) throws Exception {
        mvc.perform(post("/api/control").header("Authorization","Bearer "+token)
            .contentType("application/json").content(body)).andExpect(status().is(expected));
    }

    @Test
    void jwtApiHttpStubAndRealMySqlShareTheContractWithoutPhysicalCommands() throws Exception {
        mvc.perform(get("/api/state")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/control").contentType("application/json").content("{\"target\":\"FAN\",\"action\":\"ON\"}"))
            .andExpect(status().isUnauthorized());
        assertTrue(STUB.calls.isEmpty());
        String login=mvc.perform(post("/api/auth/login").contentType("application/json")
            .content("{\"username\":\"teacher\",\"password\":\"Teacher@12345\"}"))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String token=mapper.readTree(login).path("data").path("accessToken").asText();
        String state="{\"device_id\":\"node1_sensor\",\"temp\":29.5,\"humid\":71,\"lux\":230,\"occupancy\":1,\"FAN\":false,\"LIGHT\":true,\"extra\":{\"online\":true}}";
        STUB.reply(200,state);
        String stateResult=mvc.perform(get("/api/state").header("Authorization","Bearer "+token))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertEquals(mapper.readTree(state),mapper.readTree(stateResult).path("data"));
        assertEquals("/smarthome/api/state",STUB.calls.get(0).path());
        STUB.calls.clear();
        for(String invalid:List.of("{}","{\"target\":\"INVALID\",\"action\":\"ON\"}","{\"target\":\"FAN\",\"action\":\"INVALID\"}",
            "{\"target\":\"FAN\",\"action\":\"ON\",\"trigger_by\":\"admin\"}","{\"target\":\"FAN\",\"action\":\"ON\",\"role\":\"ADMIN\"}")) sendControl(token,invalid,400);
        assertTrue(STUB.calls.isEmpty());
        jdbc.update("INSERT INTO command_logs(device_id,target,action,trigger_by) VALUES ('node2_actuator','LIGHT','OFF','RULE_ENGINE')");
        jdbc.update("INSERT INTO classroom_bookings(owner_id,owner_name,title,starts_at,ends_at,status) SELECT id,username,'Integration class',DATE_SUB(NOW(),INTERVAL 1 HOUR),DATE_ADD(NOW(),INTERVAL 1 HOUR),'APPROVED' FROM users WHERE username='teacher'");
        var ruleBefore=jdbc.queryForList("SELECT * FROM command_logs WHERE trigger_by='RULE_ENGINE'");
        long before=logCount();
        org.mockito.Mockito.doAnswer(invocation -> {
            assertFalse(TransactionSynchronizationManager.isActualTransactionActive(), "HTTP must run outside database transactions");
            return invocation.callRealMethod();
        }).when(nodeRed).command(org.mockito.ArgumentMatchers.any());
        STUB.reply(200,"{\"msg\":\"SUCCESS\",\"device_id\":\"node2_actuator\",\"target\":\"FAN\",\"action\":\"ON\"}");
        assertFalse(TransactionSynchronizationManager.isActualTransactionActive());
        mvc.perform(post("/api/control").header("Authorization","Bearer "+token).contentType("application/json")
            .content("{\"target\":\"FAN\",\"action\":\"ON\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("SUCCESS"))
            .andExpect(jsonPath("$.data.trigger_by").value("teacher")).andExpect(jsonPath("$.data.log_status").value("SAVED"));
        assertEquals(before+1,logCount());assertEquals(1,STUB.calls.size());
        assertEquals("SUCCESS",jdbc.queryForObject("SELECT status FROM classroom_command_attempts ORDER BY id DESC LIMIT 1",String.class));
        assertEquals("/smarthome/api/command",STUB.calls.get(0).path());
        assertEquals(mapper.readTree("{\"target\":\"FAN\",\"action\":\"ON\"}"),mapper.readTree(STUB.calls.get(0).body()));
        assertNull(STUB.calls.get(0).authorization());
        assertEquals("teacher",jdbc.queryForObject("SELECT trigger_by FROM command_logs ORDER BY id DESC LIMIT 1",String.class));
        assertNotNull(jdbc.queryForObject("SELECT timestamp FROM command_logs ORDER BY id DESC LIMIT 1",java.sql.Timestamp.class));
        STUB.reply(202,"{\"msg\":\"ACCEPTED\"}");
        mvc.perform(post("/api/control").header("Authorization","Bearer "+token).contentType("application/json")
            .content("{\"target\":\"FAN\",\"action\":\"ON\"}"))
            .andExpect(status().isAccepted()).andExpect(jsonPath("$.data.status").value("ACCEPTED"));
        assertEquals(before+2,logCount());
        assertEquals("ACCEPTED",jdbc.queryForObject("SELECT status FROM classroom_command_attempts ORDER BY id DESC LIMIT 1",String.class));
        for(String body:List.of("{\"msg\":\"FAILURE\"}","{\"msg\":\"SUCCESS\",\"device_id\":\"node2_actuator\",\"target\":\"LIGHT\",\"action\":\"ON\"}","{\"msg\":\"SUCCESS\"}","not-json")) {
            STUB.reply(200,body);int calls=STUB.calls.size();sendControl(token,"{\"target\":\"FAN\",\"action\":\"ON\"}",502);
            assertEquals(calls+1,STUB.calls.size());assertEquals(before+2,logCount());
        }
        STUB.reply(200,"{\"msg\":\"TIMEOUT\"}");sendControl(token,"{\"target\":\"FAN\",\"action\":\"ON\"}",504);
        STUB.reply=new NodeRedStub.Reply(200,"{\"msg\":\"ACCEPTED\"}",1800,false);
        int timeoutCalls=STUB.calls.size();sendControl(token,"{\"target\":\"FAN\",\"action\":\"ON\"}",504);
        assertEquals(timeoutCalls+1,STUB.calls.size());assertEquals(before+2,logCount());
        assertEquals(ruleBefore,jdbc.queryForList("SELECT * FROM command_logs WHERE trigger_by='RULE_ENGINE'"));
        STUB.close();
        mvc.perform(get("/api/state").header("Authorization","Bearer "+token)).andExpect(status().isServiceUnavailable());
        sendControl(token,"{\"target\":\"FAN\",\"action\":\"ON\"}",503);
        assertEquals("UNCONFIRMED",jdbc.queryForObject("SELECT status FROM classroom_command_attempts ORDER BY id DESC LIMIT 1",String.class));
        assertEquals(before+2,logCount());
    }
}
