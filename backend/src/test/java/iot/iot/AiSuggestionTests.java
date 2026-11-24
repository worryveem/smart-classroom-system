package iot.iot;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import iot.iot.ai.*;
import iot.iot.classroom.RoomIotAccess;
import iot.iot.entity.User;
import iot.iot.entity.UserRole;
import iot.iot.exception.AdminOperationException;
import iot.iot.integration.nodered.NodeRedClient;
import iot.iot.security.user.CustomUserDetails;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.http.MediaType;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class AiSuggestionTests {
    final ObjectMapper mapper=new ObjectMapper();
    final AiClient ai=mock(AiClient.class);
    final NodeRedClient nodeRed=mock(NodeRedClient.class);
    final RoomIotAccess access=mock(RoomIotAccess.class);
    final JdbcTemplate db=mock(JdbcTemplate.class);
    final AiSuggestionService service=new AiSuggestionService(ai,nodeRed,access,db,mapper);
    final AiSuggestionService.AnalyzeInput input=new AiSuggestionService.AnalyzeInput(4000,false);
    CustomUserDetails actor() {
        var user=mock(User.class); when(user.getId()).thenReturn(81L);
        when(user.getUsername()).thenReturn("ai_test"); when(user.getRole()).thenReturn(UserRole.TEACHER);
        return new CustomUserDetails(user);
    }
    ObjectNode sensor() {
        var sensor=mapper.createObjectNode().put("device_id","node1_sensor").put("connected",true)
            .put("timestamp",Instant.now().toString()).put("temp",29.5).put("humid",71)
            .put("ldr_adc",3916).put("occupancy",true).put("lux",400).put("lux_demo",true);
        when(access.sensorId()).thenReturn("node1_sensor");
        var root=mapper.createObjectNode(); root.putArray("devices").add(sensor);
        when(nodeRed.state()).thenReturn(root); return sensor;
    }
    @Test void forwardsRawAdcAndPersistsOnlyForAuthenticatedUser() throws Exception {
        sensor(); var prediction=mapper.readTree("{\"label\":\"NORMAL\"}");
        when(ai.anomaly(any())).thenReturn(prediction);
        var result=service.analyze(101,input,actor());
        verify(ai).anomaly(Map.of("temp",29.5,"humidity",71.,"motion",true,"ldr_adc",3916,"threshold",4000,"high_is_bright",false));
        verify(db).update(contains("INSERT INTO ai_suggestion_history"),eq(81L),eq(101),contains("\"ldr_adc\":3916"));
        assertEquals(prediction,result.get("anomaly"));
    }
    @Test void rejectsStaleFutureOfflineMissingDhtPirAdcAndDemoLux() {
        for (String fault : new String[]{"stale","future","offline","temp","humid","occupancy","ldr_adc","adcRange","fraction"}) {
            reset(ai,db); var sensor=sensor();
            switch (fault) {
                case "stale" -> sensor.put("timestamp",Instant.now().minusSeconds(61).toString());
                case "future" -> sensor.put("timestamp",Instant.now().plusSeconds(60).toString());
                case "offline" -> sensor.put("connected",false);
                case "adcRange" -> sensor.put("ldr_adc",4096);
                case "fraction" -> sensor.put("ldr_adc",3916.5);
                default -> { sensor.remove(fault); sensor.put("lux",400); }
            }
            assertThrows(AdminOperationException.class,()->service.analyze(101,input,actor()),fault);
            verifyNoInteractions(ai,db);
        }
    }
    @Test void rejectsOtherDeviceAndRoomBeforeInference() {
        sensor().put("device_id","other_sensor");
        assertThrows(AdminOperationException.class,()->service.analyze(101,input,actor()));
        doThrow(new AdminOperationException(org.springframework.http.HttpStatus.CONFLICT,"Phòng chưa kết nối")).when(access).requireSensor(102);
        assertThrows(AdminOperationException.class,()->service.analyze(102,input,actor()));
        verifyNoInteractions(ai,db);
    }
    @Test void unavailableAiDoesNotWriteHistory() {
        sensor(); when(ai.anomaly(any())).thenThrow(new AdminOperationException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"AI offline"));
        assertThrows(AdminOperationException.class,()->service.analyze(101,input,actor())); verifyNoInteractions(db);
    }
    @Test void unavailableNodeRedReturnsReadableErrorWithoutInference() {
        when(access.sensorId()).thenReturn("node1_sensor");
        when(nodeRed.state()).thenThrow(new iot.iot.exception.IntegrationException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"offline"));
        var error=assertThrows(AdminOperationException.class,()->service.analyze(101,input,actor()));
        assertTrue(error.getMessage().contains("Chưa đọc được cảm biến"));
        verifyNoInteractions(ai,db);
    }
    @Test void historyAlwaysFiltersActorAndRoom() {
        service.history(101,actor());
        verify(db).query(contains("WHERE user_id=? AND room_id=?"),any(RowMapper.class),eq(81L),eq(101));
    }
    @Test void clientRejectsInvalidPredictionAndHttpFailure() {
        var builder=RestClient.builder().baseUrl("http://ai.test");
        var server=MockRestServiceServer.bindTo(builder).build(); var client=new AiClient(builder.build());
        server.expect(requestTo("http://ai.test/predict/anomaly/adc")).andRespond(withSuccess("{\"label\":\"NORMAL\"}",MediaType.APPLICATION_JSON));
        assertThrows(AdminOperationException.class,()->client.anomaly(Map.of()));
        server.verify(); server.reset();
        server.expect(requestTo("http://ai.test/health")).andRespond(withServiceUnavailable());
        assertThrows(AdminOperationException.class,client::health); server.verify();
    }
    @Test void statusShowsOfflineWithoutClaimingOccupancyIntegration() {
        when(ai.health()).thenThrow(new AdminOperationException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"offline"));
        var result=service.status(101);
        assertEquals(false,result.get("occupancyLiveReady"));
        assertEquals("offline",((Map<?,?>)result.get("service")).get("status"));
    }
    @Test void originalOccupancyModelIsUsedWithoutAdcRetraining() throws Exception {
        var health=mapper.readTree("{\"models\":{\"occupancy\":true,\"occupancy_adc\":false}}");
        when(ai.health()).thenReturn(health);
        assertEquals(true,service.status(101).get("occupancyLiveReady"));
        when(ai.health()).thenReturn(mapper.readTree("{\"models\":{\"occupancy\":false}}"));
        assertEquals(false,service.status(101).get("occupancyLiveReady"));
    }
    @Test void liveOccupancyForwardsRealValuesWithoutDuplicationRescalingOrAnomaly() throws Exception {
        var sensor=sensor(); sensor.put("lux",407.25); sensor.remove("humid"); sensor.remove("ldr_adc");
        when(ai.occupancyLive(any())).thenReturn(mapper.readTree("{\"label\":\"LOW\",\"data_source\":\"CURRENT_SENSOR\"}"));
        var result=service.occupancyLive(101);
        int hour=java.time.Instant.parse(sensor.path("timestamp").asText()).atZone(java.time.ZoneId.of("Asia/Ho_Chi_Minh")).getHour();
        verify(ai).occupancyLive(Map.of("temperatures",java.util.List.of(29.5),"lights",java.util.List.of(407.25),
            "pir_values",java.util.List.of(1),"hour",hour,"light_source","LDR_DEMO_LUX"));
        verify(ai,never()).anomaly(any()); verifyNoInteractions(db);
        assertEquals("LOW",((com.fasterxml.jackson.databind.JsonNode)result.get("prediction")).path("label").asText());
    }
    @Test void liveOccupancyRejectsMissingLightRatherThanInventingInput() {
        sensor().remove("lux");
        assertThrows(AdminOperationException.class,()->service.occupancyLive(101));
        verifyNoInteractions(ai,db);
    }
    @Test void validatesAdcSettings() {
        try (var factory=jakarta.validation.Validation.buildDefaultValidatorFactory()) {
            var validator=factory.getValidator();
            for (var invalid:new AiSuggestionService.AnalyzeInput[]{new AiSuggestionService.AnalyzeInput(0,false),
                new AiSuggestionService.AnalyzeInput(4095,false),new AiSuggestionService.AnalyzeInput(null,false),
                new AiSuggestionService.AnalyzeInput(4000,null)}) assertFalse(validator.validate(invalid).isEmpty());
        }
    }
}
