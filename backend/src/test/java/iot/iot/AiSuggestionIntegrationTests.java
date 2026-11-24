package iot.iot;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import iot.iot.ai.AiClient;
import iot.iot.integration.nodered.NodeRedClient;
import java.time.Instant;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"app.classroom.alerts-enabled=false","app.automation.scheduler-enabled=false","debug=false"})
@ActiveProfiles("local")
@AutoConfigureMockMvc(print=MockMvcPrint.NONE)
@EnabledIfEnvironmentVariable(named="SMARTCLASS_MYSQL_TEST_URL",matches=".+")
class AiSuggestionIntegrationTests {
    @DynamicPropertySource static void properties(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url",()->MySqlTestSupport.url("_ai"));
        p.add("app.jwt.secret",MySqlTestSupport::jwtSecret);
    }
    @Autowired MockMvc mvc; @Autowired JdbcTemplate db; @Autowired ObjectMapper mapper;
    @MockitoBean AiClient ai; @MockitoBean NodeRedClient nodeRed;
    String admin,teacher,student;
    JsonNode call(MockHttpServletRequestBuilder request,String token,Object body,int expected) throws Exception {
        if(token!=null) request.header("Authorization",token);
        if(body!=null) request.contentType("application/json").content(mapper.writeValueAsString(body));
        return mapper.readTree(mvc.perform(request).andExpect(status().is(expected)).andReturn().getResponse()
            .getContentAsString(java.nio.charset.StandardCharsets.UTF_8)).path("data");
    }
    String login(String username,String password) throws Exception {
        return "Bearer "+call(post("/api/auth/login"),null,Map.of("username",username,"password",password),200).path("accessToken").asText();
    }
    @BeforeEach void setup() throws Exception {
        assertTrue(db.queryForObject("SELECT DATABASE()",String.class).matches("smartclass_verify_[a-zA-Z0-9_]+_ai"));
        db.update("DELETE FROM ai_suggestion_history");
        admin=login("admin","Admin@12345"); teacher=login("teacher","Teacher@12345"); student=login("student","Student@12345");
        when(ai.health()).thenReturn(mapper.readTree("{\"status\":\"ready\",\"models\":{\"anomaly\":true,\"occupancy\":true}}"));
        when(ai.anomaly(any())).thenReturn(mapper.readTree("{\"experimental\":true,\"label\":\"NORMAL\",\"decision_score\":0.02,\"suggestion\":\"Mẫu bình thường\",\"notice\":\"Thử nghiệm\",\"light_conversion\":{\"light\":true}}"));
        var root=mapper.createObjectNode();
        root.putArray("devices").addObject().put("device_id","node1_sensor").put("connected",true)
            .put("timestamp",Instant.now().toString()).put("temp",29.5).put("humid",71).put("ldr_adc",3916).put("occupancy",true).put("lux",400).put("lux_demo",true);
        when(nodeRed.state()).thenReturn(root);
    }
    @Test void migrationAuthenticatedAnalysisAndHistoryIsolation() throws Exception {
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE version='9' AND success=1",Integer.class));
        var result=call(post("/api/ai/rooms/101/analyze"),teacher,Map.of("threshold",4000,"highIsBright",false),200);
        assertEquals(3916,result.path("input").path("ldr_adc").intValue());
        assertEquals("NORMAL",result.path("anomaly").path("label").asText());
        assertEquals(1,call(get("/api/ai/rooms/101/history"),teacher,null,200).size());
        assertEquals(0,call(get("/api/ai/rooms/101/history?userId=2"),admin,null,200).size());
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM ai_suggestion_history",Integer.class));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM command_logs",Integer.class));
        assertTrue(call(get("/api/ai/rooms/101/status"),teacher,null,200).path("occupancyLiveReady").asBoolean());
    }
    @Test void securityValidationAndOtherRoomsNeverReachModel() throws Exception {
        clearInvocations(ai,nodeRed);
        for (String suffix:new String[]{"status","history"}) {
            call(get("/api/ai/rooms/101/"+suffix),null,null,401);
            call(get("/api/ai/rooms/101/"+suffix),student,null,403);
        }
        var input=Map.of("threshold",4000,"highIsBright",false);
        call(post("/api/ai/rooms/101/analyze"),student,input,403);
        call(post("/api/ai/rooms/101/analyze"),teacher,Map.of("threshold",4095,"highIsBright",false),400);
        call(post("/api/ai/rooms/101/analyze"),teacher,Map.of("threshold",4000,"highIsBright",false,"userId",1),400);
        call(post("/api/ai/rooms/102/analyze"),admin,input,409);
        verifyNoInteractions(ai,nodeRed);
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM ai_suggestion_history",Integer.class));
    }
    @Test void observationsAreManualOwnedAndExportRawAdcWithoutInventingLabels() throws Exception {
        call(post("/api/ai/rooms/101/analyze"),teacher,Map.of("threshold",4000,"highIsBright",false),200);
        long id=db.queryForObject("SELECT MAX(id) FROM ai_suggestion_history",Long.class);
        call(put("/api/ai/rooms/101/dataset/"+id),admin,Map.of("peopleCount",2),404);
        call(put("/api/ai/rooms/101/dataset/"+id),teacher,Map.of("peopleCount",-1),400);
        call(put("/api/ai/rooms/101/dataset/"+id),teacher,Map.of("peopleCount",2,"label","LOW"),400);
        call(put("/api/ai/rooms/101/dataset/"+id),teacher,Map.of("peopleCount",2),200);
        call(put("/api/ai/rooms/101/dataset/"+id),teacher,Map.of("peopleCount",3),200);
        assertEquals(3,db.queryForObject("SELECT people_count FROM ai_occupancy_observations WHERE history_id=?",Integer.class,id));
        assertEquals(1,call(get("/api/ai/rooms/101/dataset"),teacher,null,200).path("count").intValue());
        assertEquals(0,call(get("/api/ai/rooms/101/dataset"),admin,null,200).path("count").intValue());
        String csv=mvc.perform(get("/api/ai/rooms/101/dataset/export").header("Authorization",teacher)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertTrue(csv.contains("ldr_adc,pir_active,people_count,label_source"));
        assertTrue(csv.contains(",3916,1,3,MANUAL"));
        assertFalse(csv.contains("lux"));
        assertFalse(csv.contains("LOW"));
        for(String suffix:new String[]{"dataset","dataset/export"}) {
            call(get("/api/ai/rooms/101/"+suffix),student,null,403);
            call(get("/api/ai/rooms/101/"+suffix),null,null,401);
        }
        call(put("/api/ai/rooms/101/dataset/"+id),student,Map.of("peopleCount",2),403);
    }
    @Test void observationsRejectOldSamplesWithoutWritingLabel() throws Exception {
        call(post("/api/ai/rooms/101/analyze"),teacher,Map.of("threshold",4000,"highIsBright",false),200);
        long id=db.queryForObject("SELECT MAX(id) FROM ai_suggestion_history",Long.class);
        db.update("UPDATE ai_suggestion_history SET result_json=JSON_SET(result_json,'$.sampledAt',?) WHERE id=?",Instant.now().minusSeconds(301).toString(),id);
        call(put("/api/ai/rooms/101/dataset/"+id),teacher,Map.of("peopleCount",2),409);
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM ai_occupancy_observations",Integer.class));
    }
    @Test void occupancyDemoUsesOriginalModelWithoutLiveSensorOrDatasetWrites() throws Exception {
        when(ai.occupancyDemo("EMPTY")).thenReturn(mapper.readTree("{\"label\":\"EMPTY\",\"data_source\":\"SAMPLE_DATASET\",\"sample\":{\"light_mean\":0},\"notice\":\"Dữ liệu mẫu\"}"));
        clearInvocations(nodeRed);
        var result=call(post("/api/ai/rooms/101/occupancy-demo"),teacher,Map.of("sampleLabel","EMPTY"),200);
        assertEquals("SAMPLE_DATASET",result.path("data_source").asText());
        call(post("/api/ai/rooms/101/occupancy-demo"),student,Map.of("sampleLabel","EMPTY"),403);
        call(post("/api/ai/rooms/101/occupancy-demo"),null,Map.of("sampleLabel","EMPTY"),401);
        call(post("/api/ai/rooms/101/occupancy-demo"),teacher,Map.of("sampleLabel","UNKNOWN"),400);
        call(post("/api/ai/rooms/101/occupancy-demo"),teacher,Map.of("sampleLabel","EMPTY","ldr_adc",3916),400);
        verifyNoInteractions(nodeRed);
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM ai_suggestion_history",Integer.class));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM ai_occupancy_observations",Integer.class));
    }
    @Test void liveOccupancyReadsCurrentSensorAndProtectsAccess() throws Exception {
        when(ai.occupancyLive(any())).thenReturn(mapper.readTree("{\"label\":\"CROWDED\",\"data_source\":\"CURRENT_SENSOR\",\"features\":{\"light_mean\":400},\"estimated_light\":true,\"notice\":\"Ước tính\",\"notices\":[]}"));
        var result=call(post("/api/ai/rooms/101/occupancy-live"),teacher,null,200);
        assertEquals("CURRENT_SENSOR",result.path("prediction").path("data_source").asText());
        verify(nodeRed).state();
        verify(ai,never()).occupancyDemo(any());
        call(post("/api/ai/rooms/101/occupancy-live"),student,null,403);
        call(post("/api/ai/rooms/101/occupancy-live"),null,null,401);
        call(post("/api/ai/rooms/102/occupancy-live"),admin,null,409);
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM ai_suggestion_history",Integer.class));
    }
}
