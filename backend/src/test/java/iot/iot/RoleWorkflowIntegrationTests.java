package iot.iot;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import iot.iot.classroom.ClassroomService;
import java.util.*;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties="app.classroom.alerts-enabled=false")
@ActiveProfiles("local")
@AutoConfigureMockMvc(print=MockMvcPrint.NONE)
@EnabledIfEnvironmentVariable(named="SMARTCLASS_MYSQL_TEST_URL",matches=".+")
class RoleWorkflowIntegrationTests {
    @DynamicPropertySource static void properties(DynamicPropertyRegistry p) {
        p.add("spring.datasource.url",()->MySqlTestSupport.url("_roles")); p.add("app.jwt.secret",MySqlTestSupport::jwtSecret);
    }
    @Autowired MockMvc mvc; @Autowired JdbcTemplate db; @Autowired ObjectMapper mapper; @Autowired ClassroomService classroom;
    String admin,teacher,student;
    JsonNode call(MockHttpServletRequestBuilder request,String token,Object body,int status) throws Exception {
        if(token!=null) request.header("Authorization",token);
        if(body!=null) request.contentType("application/json").content(mapper.writeValueAsString(body));
        return mapper.readTree(mvc.perform(request).andExpect(status().is(status)).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8)).path("data");
    }
    String login(String name,String password) throws Exception { return "Bearer "+call(post("/api/auth/login"),null,Map.of("username",name,"password",password),200).path("accessToken").asText(); }
    @BeforeEach void setup() throws Exception {
        for(String table:List.of("classroom_command_attempts","classroom_incident_events","classroom_incidents","classroom_alerts","classroom_bookings","telemetry","command_logs")) db.update("DELETE FROM "+table);
        db.update("UPDATE classroom_rooms SET status='ACTIVE',maintenance_note=''");
        db.update("UPDATE classroom_settings SET sensor_device_id='node1_sensor',temperature_limit=32,minimum_lux=150 WHERE id=1");
        db.update("UPDATE devices SET room_id=101,status='Active' WHERE device_id IN ('node1_sensor','node2_actuator')");
        admin=login("admin","Admin@12345"); teacher=login("teacher","Teacher@12345"); student=login("student","Student@12345");
    }
    Map<String,Object> input(int room,int offset) {
        var start=ClassroomService.now().plusHours(offset).withNano(0);
        return Map.of("roomId",room,"title","Workflow","startsAt",start.toString(),"endsAt",start.plusHours(1).toString(),"expectedAttendees",20);
    }
    @Test void commandHistoryIsEnforcedAtTheApiBoundary() throws Exception {
        for(String actor:List.of("admin","teacher","RULE_ENGINE")) db.update("INSERT INTO command_logs(device_id,target,action,trigger_by) VALUES ('node2_actuator','FAN','ON',?)",actor);
        call(get("/api/commands"),student,null,403);
        var rows=call(get("/api/commands?triggerBy=admin"),teacher,null,200);
        assertEquals(1,rows.path("totalElements").asInt()); assertEquals("teacher",rows.path("content").get(0).path("trigger_by").asText());
        assertEquals(3,call(get("/api/commands"),admin,null,200).path("totalElements").asInt());
    }
    @Test void configuredHardwareCannotBeSilentlyMovedButItsStatusCanBeUpdated() throws Exception {
        call(put("/api/devices/node1_sensor"),admin,Map.of("roomId",102,"type","SENSOR","status","ACTIVE"),409);
        assertEquals(101,db.queryForObject("SELECT room_id FROM devices WHERE device_id='node1_sensor'",Integer.class));
        call(put("/api/devices/node1_sensor"),admin,Map.of("roomId",101,"type","SENSOR","status","OFFLINE"),200);
        call(delete("/api/devices/node2_actuator"),admin,null,409);
    }
    @Test void expiredHoldsReleaseTheSlotAndCannotBeApproved() throws Exception {
        var body=input(101,2); long id=call(post("/api/classroom/bookings"),teacher,body,200).path("id").asLong();
        db.update("UPDATE classroom_bookings SET expires_at=? WHERE id=?",ClassroomService.now().minusMinutes(1),id);
        classroom.expirePendingBookings();
        assertEquals("EXPIRED",db.queryForObject("SELECT status FROM classroom_bookings WHERE id=?",String.class,id));
        call(patch("/api/classroom/bookings/"+id),admin,Map.of("status","APPROVED","note",""),409);
        call(post("/api/classroom/bookings"),teacher,body,200);
    }
    @Test void editingPendingBookingChecksOwnershipAndPreservesDeadline() throws Exception {
        long id=call(post("/api/classroom/bookings"),teacher,input(101,2),200).path("id").asLong();
        var deadline=db.queryForObject("SELECT expires_at FROM classroom_bookings WHERE id=?",java.sql.Timestamp.class,id);
        call(put("/api/classroom/bookings/"+id),student,input(102,3),403);
        call(put("/api/classroom/bookings/"+id),teacher,input(102,3),200);
        assertEquals(deadline,db.queryForObject("SELECT expires_at FROM classroom_bookings WHERE id=?",java.sql.Timestamp.class,id));
        long other=call(post("/api/classroom/bookings"),admin,input(103,5),200).path("id").asLong();
        call(put("/api/classroom/bookings/"+other),teacher,input(103,6),403);
        call(patch("/api/classroom/bookings/"+id),admin,Map.of("status","APPROVED","note",""),200);
        call(put("/api/classroom/bookings/"+id),teacher,input(102,4),409);
    }
    @Test void workspaceDoesNotExposeAnotherOwnersBookingsOrIncidentText() throws Exception {
        call(post("/api/classroom/bookings"),teacher,input(101,2),200); call(post("/api/classroom/bookings"),admin,input(102,4),200);
        call(post("/api/classroom/incidents"),student,Map.of("roomId",101,"title","Private report","description","Private detail"),200);
        assertEquals(1,call(get("/api/classroom/workspace"),teacher,null,200).path("bookings").size());
        assertEquals(2,call(get("/api/classroom/workspace"),admin,null,200).path("bookings").size());
        assertEquals(0,call(get("/api/classroom/workspace"),student,null,200).path("bookings").size());
        var summary=call(get("/api/iot/rooms/101"),teacher,null,200).path("incidentSummary");
        assertEquals(1,summary.size()); assertFalse(summary.toString().contains("Private"));
    }
    @Test void alertAcknowledgementNeedsCurrentBookingButNotAnOnlineActuator() throws Exception {
        db.update("INSERT INTO classroom_alerts(kind,message,room_id) VALUES ('SENSOR_OFFLINE','Offline',101)");
        long id=db.queryForObject("SELECT id FROM classroom_alerts",Long.class);
        call(post("/api/classroom/alerts/"+id+"/acknowledge"),teacher,null,403);
        db.update("INSERT INTO classroom_bookings(owner_id,owner_name,title,starts_at,ends_at,status,room_id) SELECT id,username,'Current',?,?,'APPROVED',101 FROM users WHERE username='teacher'",ClassroomService.now().minusMinutes(5),ClassroomService.now().plusMinutes(30));
        db.update("UPDATE devices SET status='Offline' WHERE device_id='node2_actuator'");
        var permission=call(get("/api/classroom/permission?roomId=101"),teacher,null,200);
        assertFalse(permission.path("allowed").asBoolean()); assertTrue(permission.path("canAcknowledge").asBoolean());
        call(post("/api/classroom/alerts/"+id+"/acknowledge"),student,null,403);
        call(post("/api/classroom/alerts/"+id+"/acknowledge"),teacher,null,200);
    }
    @Test void reportsUseApprovalContextAfterConfigurationOrAssignmentChanges() throws Exception {
        long id=call(post("/api/classroom/bookings"),teacher,input(101,2),200).path("id").asLong();
        call(patch("/api/classroom/bookings/"+id),admin,Map.of("status","APPROVED","note",""),200);
        var now=ClassroomService.now().withNano(0);
        db.update("UPDATE classroom_bookings SET starts_at=?,ends_at=? WHERE id=?",now.minusHours(2),now.minusHours(1),id);
        db.update("INSERT INTO telemetry(device_id,temp,lux,occupancy,`timestamp`) VALUES ('node1_sensor',40,100,1,?)",now.minusMinutes(90));
        db.update("UPDATE classroom_settings SET temperature_limit=60,minimum_lux=0,sensor_device_id='replacement' WHERE id=1");
        db.update("UPDATE devices SET room_id=102 WHERE device_id='node1_sensor'");
        var report=call(get("/api/classroom/bookings/"+id+"/report"),teacher,null,200);
        assertEquals(1,report.path("environment").path("samples").asInt()); assertEquals(1,report.path("environment").path("hot_samples").asInt());
        assertEquals(32,report.path("thresholds").path("temperature_limit").asInt());
    }
}
