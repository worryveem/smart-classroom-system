package iot.iot;

import com.fasterxml.jackson.databind.*;
import iot.iot.integration.nodered.NodeRedClient;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"app.classroom.alerts-enabled=false","app.automation.scheduler-enabled=false","debug=false"})
@ActiveProfiles("local")
@AutoConfigureMockMvc(print=MockMvcPrint.NONE)
@EnabledIfEnvironmentVariable(named="SMARTCLASS_MYSQL_TEST_URL",matches=".+")
class AbnormalAlertIntegrationTests {
    @DynamicPropertySource static void properties(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url",()->MySqlTestSupport.url("_abnormal")); p.add("app.jwt.secret",MySqlTestSupport::jwtSecret);
    }
    @Autowired MockMvc mvc; @Autowired ObjectMapper mapper;
    @MockitoBean NodeRedClient nodeRed;
    String login(String user,String password) throws Exception {
        var body=mvc.perform(post("/api/auth/login").contentType("application/json").content(mapper.writeValueAsString(Map.of("username",user,"password",password))))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return "Bearer "+mapper.readTree(body).path("data").path("accessToken").asText();
    }
    @BeforeEach void fixture() {
        var root=mapper.createObjectNode(); var devices=root.putArray("devices");
        devices.addObject().put("device_id","node1_sensor").put("connected",true).put("timestamp",Instant.now().toString()).put("temp",35).put("lux",400).put("lux_demo",true);
        devices.addObject().put("device_id","node2_actuator").put("connected",true).put("timestamp",Instant.now().toString()).put("FAN",false).put("LIGHT",true);
        when(nodeRed.state()).thenReturn(root);
    }
    @Test void staffSeeCurrentMismatchesWithoutSendingCommands() throws Exception {
        for(var user:Map.of("teacher","Teacher@12345","admin","Admin@12345").entrySet()) {
            var response=mvc.perform(get("/api/rooms/101/abnormal-alerts").header("Authorization",login(user.getKey(),user.getValue())))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andReturn().getResponse().getContentAsString();
            var data=mapper.readTree(response).path("data");
            assertEquals(4,data.path("rules").size());
            assertEquals("ALERT",data.path("rules").get(0).path("status").asText());
            assertEquals("ALERT",data.path("rules").get(3).path("status").asText());
            assertTrue(data.path("estimatedLight").asBoolean());
        }
        verify(nodeRed,never()).command(any());
    }
    @Test void studentsAnonymousAndOtherRoomsCannotReadConfiguredRoomData() throws Exception {
        var student=login("student","Student@12345"); var teacher=login("teacher","Teacher@12345");
        clearInvocations(nodeRed);
        mvc.perform(get("/api/rooms/101/abnormal-alerts")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/rooms/101/abnormal-alerts").header("Authorization",student)).andExpect(status().isForbidden());
        mvc.perform(get("/api/rooms/102/abnormal-alerts").header("Authorization",teacher)).andExpect(status().isConflict());
        verifyNoInteractions(nodeRed);
    }
}
