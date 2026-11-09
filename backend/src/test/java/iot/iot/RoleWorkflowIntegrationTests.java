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
        for(String table:List.of("app_notifications","classroom_command_attempts","classroom_incident_events","classroom_incidents","classroom_alerts","classroom_bookings","telemetry","command_logs")) db.update("DELETE FROM "+table);
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
    @Test void teachingHistoryIncludesPastBookingsAndCannotBeReadForAnotherUser() throws Exception {
        long own=call(post("/api/classroom/bookings"),teacher,input(101,2),200).path("id").asLong();
        long other=call(post("/api/classroom/bookings"),admin,input(102,4),200).path("id").asLong();
        db.update("UPDATE classroom_bookings SET starts_at=?,ends_at=?,status='REJECTED' WHERE id=?",ClassroomService.now().minusDays(2),ClassroomService.now().minusDays(2).plusHours(1),own);
        var history=call(get("/api/teaching/bookings?period=PAST&status=REJECTED&roomId=101&ownerId=1"),teacher,null,200);
        assertEquals(1,history.path("totalElements").asInt()); assertEquals(own,history.path("rows").get(0).path("id").asLong());
        assertEquals(0,call(get("/api/teaching/bookings?period=UPCOMING"),teacher,null,200).path("totalElements").asInt());
        call(get("/api/teaching/bookings/"+other),teacher,null,404); call(get("/api/teaching/bookings"),student,null,403);
        call(get("/api/teaching/bookings/"+own),student,null,403); call(get("/api/classroom/bookings/"+other),teacher,null,403);
        call(get("/api/teaching/bookings?period=invalid"),teacher,null,400); call(get("/api/teaching/bookings?size=51"),teacher,null,400);
        call(get("/api/teaching/bookings?from=2026-11-10&to=2026-11-09"),teacher,null,400);
        call(get("/api/teaching/bookings?from=0000-01-01"),teacher,null,400);
    }
    @Test void teachingHistoryHasStablePaginationAndDayOverlapFilters() throws Exception {
        long one=call(post("/api/classroom/bookings"),teacher,input(101,2),200).path("id").asLong();
        call(post("/api/classroom/bookings"),teacher,input(102,4),200);
        var first=call(get("/api/teaching/bookings?period=UPCOMING&size=1"),teacher,null,200);
        assertEquals(2,first.path("totalElements").asInt()); assertEquals(2,first.path("totalPages").asInt()); assertEquals(one,first.path("rows").get(0).path("id").asLong());
        assertNotEquals(one,call(get("/api/teaching/bookings?period=UPCOMING&size=1&page=1"),teacher,null,200).path("rows").get(0).path("id").asLong());
        var day=ClassroomService.now().toLocalDate().minusDays(3);
        db.update("UPDATE classroom_bookings SET starts_at=?,ends_at=?,status='CANCELLED' WHERE id=?",day.atTime(23,30),day.plusDays(1).atTime(0,30),one);
        assertEquals(1,call(get("/api/teaching/bookings?from="+day.plusDays(1)+"&to="+day.plusDays(1)),teacher,null,200).path("totalElements").asInt());
    }
    @Test void notificationsArePersonalAndReadOperationsAreIdempotent() throws Exception {
        long id=call(post("/api/classroom/bookings"),teacher,input(101,2),200).path("id").asLong();
        assertEquals(1,call(get("/api/notifications"),admin,null,200).path("totalElements").asInt());
        call(patch("/api/classroom/bookings/"+id),admin,Map.of("status","APPROVED","note","Đã duyệt"),200);
        var list=call(get("/api/notifications?recipientId=1"),teacher,null,200);
        assertEquals(1,list.path("unreadCount").asInt());
        var notification=list.path("rows").get(0); long notificationId=notification.path("id").asLong();
        assertEquals("/my-schedule?bookingId="+id,notification.path("target_path").asText());
        assertEquals(0,call(get("/api/notifications"),student,null,200).path("totalElements").asInt());
        call(patch("/api/notifications/"+notificationId+"/read"),student,null,404);
        call(patch("/api/notifications/"+notificationId+"/read"),teacher,null,200);
        var readAt=db.queryForObject("SELECT read_at FROM app_notifications WHERE id=?",java.sql.Timestamp.class,notificationId);
        call(patch("/api/notifications/"+notificationId+"/read"),teacher,null,200);
        assertEquals(readAt,db.queryForObject("SELECT read_at FROM app_notifications WHERE id=?",java.sql.Timestamp.class,notificationId));
        assertEquals(0,call(get("/api/notifications/unread-count"),teacher,null,200).path("count").asInt());
    }
    @Test void markingAllReadDoesNotConsumeNewerNotifications() throws Exception {
        for(int offset:new int[]{2,4}) {
            long id=call(post("/api/classroom/bookings"),teacher,input(101,offset),200).path("id").asLong();
            call(patch("/api/classroom/bookings/"+id),admin,Map.of("status","APPROVED","note",""),200);
            if(offset==2) call(post("/api/notifications/read-all"),teacher,Map.of("upToId",0),200);
        }
        var list=call(get("/api/notifications?size=1&page=1"),teacher,null,200);
        long older=list.path("rows").get(0).path("id").asLong();
        call(post("/api/notifications/read-all"),teacher,Map.of("upToId",older),200);
        assertEquals(1,call(get("/api/notifications?unreadOnly=true"),teacher,null,200).path("totalElements").asInt());
        call(get("/api/notifications?page=-1"),teacher,null,400); call(get("/api/notifications?size=51"),teacher,null,400);
        call(post("/api/notifications/read-all"),teacher,Map.of("upToId",-1),400);
    }
    @Test void expirationAndMaintenanceNotifyOnceWithoutDeletingBookings() throws Exception {
        long expired=call(post("/api/classroom/bookings"),teacher,input(101,2),200).path("id").asLong();
        db.update("UPDATE classroom_bookings SET expires_at=? WHERE id=?",ClassroomService.now().minusMinutes(1),expired);
        classroom.expirePendingBookings(); classroom.expirePendingBookings();
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM app_notifications WHERE kind='BOOKING_EXPIRED'",Integer.class));
        long id=call(post("/api/classroom/bookings"),teacher,input(101,3),200).path("id").asLong();
        var maintenance=Map.of("roomId",101,"name","Phòng 101","floor",1,"capacity",40,"equipment","","status","MAINTENANCE","note","Sửa điện");
        call(put("/api/building/rooms/101"),admin,maintenance,409);
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM app_notifications WHERE kind='BOOKING_CANCELLED'",Integer.class));
        call(put("/api/building/rooms/101?cancelAffectedBookings=true"),admin,maintenance,200);
        call(put("/api/building/rooms/101?cancelAffectedBookings=true"),admin,maintenance,200);
        assertEquals("CANCELLED",db.queryForObject("SELECT status FROM classroom_bookings WHERE id=?",String.class,id));
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM app_notifications WHERE kind='BOOKING_CANCELLED'",Integer.class));
    }
    @Test void incidentUpdatesNotifyTheReporterAndDeepLinksRemainProtected() throws Exception {
        long id=call(post("/api/classroom/incidents"),student,Map.of("roomId",102,"title","Đèn hỏng","description","Nhờ kiểm tra"),200).path("id").asLong();
        call(patch("/api/classroom/incidents/"+id),admin,Map.of("status","IN_PROGRESS","note","Đã tiếp nhận"),200);
        var notice=call(get("/api/notifications"),student,null,200).path("rows").get(0);
        assertEquals("/classroom?roomId=102&tab=incidents&incidentId="+id,notice.path("target_path").asText());
        call(get("/api/classroom/incidents/"+id),student,null,200); call(get("/api/classroom/incidents/"+id),teacher,null,403);
    }
    @Autowired org.springframework.transaction.PlatformTransactionManager transactionManager;
    @Test void rolledBackDecisionsDoNotLeaveGhostNotifications() throws Exception {
        long id=call(post("/api/classroom/bookings"),teacher,input(101,2),200).path("id").asLong();
        int before=db.queryForObject("SELECT COUNT(*) FROM app_notifications",Integer.class);
        var template=new org.springframework.transaction.support.TransactionTemplate(transactionManager);
        assertThrows(IllegalStateException.class,()->template.executeWithoutResult(tx->{
            try { call(patch("/api/classroom/bookings/"+id),admin,Map.of("status","APPROVED","note",""),200); }
            catch(Exception e) { throw new IllegalStateException(e); }
            throw new IllegalStateException("Rollback test");
        }));
        assertEquals("PENDING",db.queryForObject("SELECT status FROM classroom_bookings WHERE id=?",String.class,id));
        assertEquals(before,db.queryForObject("SELECT COUNT(*) FROM app_notifications",Integer.class));
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
