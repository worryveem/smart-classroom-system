package iot.iot;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import iot.iot.alerts.AbnormalAlertService;
import iot.iot.classroom.RoomIotAccess;
import iot.iot.integration.nodered.*;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AbnormalAlertTests {
    final AbnormalAlertService.Thresholds thresholds=new AbnormalAlertService.Thresholds(30,28,150,250);
    final JdbcTemplate db=mock(JdbcTemplate.class);
    final NodeRedClient nodeRed=mock(NodeRedClient.class);
    final RoomIotAccess access=mock(RoomIotAccess.class);
    final NodeRedProperties properties=new NodeRedProperties("http://localhost:1880","/state","/cmd",3000,5000,"node2_actuator");
    final AbnormalAlertService service=new AbnormalAlertService(db,nodeRed,properties,access);
    final ObjectMapper mapper=new ObjectMapper();
    ObjectNode fixture() {
        when(access.sensorId()).thenReturn("node1_sensor");
        when(db.queryForMap(anyString(),eq(101))).thenReturn(Map.of("fan_on",30,"fan_off",28,"light_on",150,"light_off",250));
        var root=mapper.createObjectNode(); var devices=root.putArray("devices");
        devices.addObject().put("device_id","node1_sensor").put("connected",true).put("timestamp",Instant.now().toString()).put("temp",32).put("lux",300).put("lux_demo",true);
        devices.addObject().put("device_id","node2_actuator").put("connected",true).put("timestamp",Instant.now().toString()).put("FAN",false).put("LIGHT",true);
        when(nodeRed.state()).thenReturn(root); return root;
    }
    @Test void exactBoundariesDetectAllFourMismatchCases() {
        var hot=AbnormalAlertService.evaluate(30.,250.,false,true,true,thresholds);
        assertEquals("ALERT",hot.get(0).status()); assertEquals("ALERT",hot.get(3).status());
        var cool=AbnormalAlertService.evaluate(28.,150.,true,false,true,thresholds);
        assertEquals("ALERT",cool.get(1).status()); assertEquals("ALERT",cool.get(2).status());
    }
    @Test void matchingStatesAndHysteresisBandDoNotAlert() {
        assertTrue(AbnormalAlertService.evaluate(31.,100.,true,true,true,thresholds).stream().allMatch(r->r.status().equals("NORMAL")));
        assertTrue(AbnormalAlertService.evaluate(27.,300.,false,false,true,thresholds).stream().allMatch(r->r.status().equals("NORMAL")));
        assertTrue(AbnormalAlertService.evaluate(29.,200.,false,true,true,thresholds).stream().allMatch(r->r.status().equals("NORMAL")));
    }
    @Test void missingDataIsUnknownAndDoesNotHideIndependentLightAlert() {
        var rules=AbnormalAlertService.evaluate(null,100.,false,false,true,thresholds);
        assertEquals("UNKNOWN",rules.get(0).status()); assertEquals("UNKNOWN",rules.get(1).status());
        assertEquals("ALERT",rules.get(2).status());
        assertTrue(AbnormalAlertService.evaluate(32.,300.,false,true,false,thresholds).stream().allMatch(r->r.status().equals("UNKNOWN")));
    }
    @Test void stateUsesConfiguredDevicesAndThresholdsWithoutSendingCommands() {
        fixture(); var report=service.get(101);
        assertEquals(2,report.rules().stream().filter(r->r.status().equals("ALERT")).count());
        assertTrue(report.estimatedLight()); assertTrue(report.sensorReady()); assertTrue(report.actuatorReady());
        verify(nodeRed,never()).command(any());
        when(db.queryForMap(anyString(),eq(101))).thenReturn(Map.of("fan_on",35,"fan_off",28,"light_on",150,"light_off",350));
        assertTrue(service.get(101).rules().stream().allMatch(r->r.status().equals("NORMAL")));
    }
    @Test void staleFutureOrDisconnectedDevicesNeverProduceNormalOrAlertClaims() {
        for(String issue:new String[]{"stale","future","offline","wrong_id"}) {
            var root=fixture(); var actuator=(ObjectNode)root.path("devices").get(1);
            switch(issue) {
                case "stale" -> actuator.put("timestamp",Instant.now().minusSeconds(61).toString());
                case "future" -> actuator.put("timestamp",Instant.now().plusSeconds(60).toString());
                case "offline" -> actuator.put("connected",false);
                default -> actuator.put("device_id","other_actuator");
            }
            assertTrue(service.get(101).rules().stream().allMatch(r->r.status().equals("UNKNOWN")),issue);
        }
    }
    @Test void mismatchedTimestampsAndInvalidNumbersRemainUnknown() {
        var root=fixture(); ((ObjectNode)root.path("devices").get(0)).put("timestamp",Instant.now().minusSeconds(40).toString());
        assertFalse(service.get(101).synchronizedReadings());
        root=fixture(); ((ObjectNode)root.path("devices").get(0)).put("temp","32").put("lux",-1);
        assertTrue(service.get(101).rules().stream().allMatch(r->r.status().equals("UNKNOWN")));
    }
}
