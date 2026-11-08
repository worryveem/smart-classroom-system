package iot.iot;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import iot.iot.classroom.ClassroomService;
import java.time.LocalDateTime;
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
class BuildingIntegrationTests {
    @DynamicPropertySource static void properties(DynamicPropertyRegistry props) {
        props.add("spring.datasource.url",()->MySqlTestSupport.url("_building"));
        props.add("app.jwt.secret",MySqlTestSupport::jwtSecret);
    }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper mapper;
    String admin,teacher,student;
    JsonNode call(MockHttpServletRequestBuilder request,String token,Object body,int expected) throws Exception {
        if(token!=null) request.header("Authorization",token);
        if(body!=null) request.contentType("application/json").content(mapper.writeValueAsString(body));
        var response=mvc.perform(request).andExpect(status().is(expected)).andReturn().getResponse();
        return mapper.readTree(response.getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
    }
    String login(String name,String password) throws Exception {
        return "Bearer "+call(post("/api/auth/login"),null,Map.of("username",name,"password",password),200).path("data").path("accessToken").asText();
    }
    @BeforeEach void setup() throws Exception {
        // The environment guard requires a disposable smartclass_verify_* database.
        for(String table:List.of("classroom_room_events","classroom_command_attempts","classroom_incident_events","classroom_incidents","classroom_alerts","classroom_bookings","telemetry")) db.update("DELETE FROM "+table);
        db.update("DELETE FROM classroom_rooms WHERE id=401");
        db.update("UPDATE classroom_rooms SET status='ACTIVE',maintenance_note='',capacity=40");
        admin=login("admin","Admin@12345"); teacher=login("teacher","Teacher@12345"); student=login("student","Student@12345");
    }
    Map<String,Object> booking(int room,LocalDateTime start,LocalDateTime end,int people) {
        return Map.of("roomId",room,"title","Thực hành", "startsAt",start.toString(),"endsAt",end.toString(),"expectedAttendees",people);
    }
    Map<String,Object> room(int id,String status,int capacity) {
        return Map.of("roomId",id,"name","Phòng "+id,"floor",id/100,"capacity",capacity,"equipment","Máy chiếu","status",status,"note",status.equals("ACTIVE")?"":"Sửa hệ thống điện");
    }
    JsonNode overview(LocalDateTime start,LocalDateTime end) throws Exception {
        return call(get("/api/building/overview").param("from",start.toString()).param("to",end.toString()),admin,null,200).path("data");
    }
    JsonNode find(JsonNode overview,int id) {
        for(var row:overview.path("rooms")) if(row.path("id").asInt()==id) return row;
        fail("Missing room "+id); return null;
    }
    @Test void seededInventoryAndOnly101ShowsRealTelemetry() throws Exception {
        var now=ClassroomService.now().withNano(0);
        db.update("INSERT INTO telemetry(device_id,temp,humid,lux,occupancy,`timestamp`) VALUES ('node1_sensor',29.5,65,350,1,?)",now);
        var data=overview(now,now.plusHours(1));
        assertEquals(15,data.path("rooms").size()); assertEquals(1,data.path("summary").path("iotRooms").asInt());
        assertEquals(29.5,find(data,101).path("telemetry").path("temp").asDouble());
        assertEquals("ONLINE",find(data,101).path("sensor_status").asText());
        assertTrue(find(data,101).path("occupancy_without_booking").asBoolean());
        for(var row:data.path("rooms")) if(row.path("id").asInt()!=101) { assertTrue(row.path("telemetry").isNull()); assertEquals("NOT_CONNECTED",row.path("sensor_status").asText()); }
        call(get("/api/building/overview"),null,null,401);
        call(get("/api/building/rooms"),student,null,200);
    }
    @Test void roomOverlapIsLocalButTeacherCannotTeachTwoRoomsAtOnce() throws Exception {
        var start=ClassroomService.now().plusDays(1).withNano(0); var end=start.plusHours(1);
        call(post("/api/classroom/bookings"),teacher,booking(101,start,end,20),200);
        call(post("/api/classroom/bookings"),admin,booking(102,start,end,20),200);
        call(post("/api/classroom/bookings"),admin,booking(101,start,end,20),409);
        var conflict=call(post("/api/classroom/bookings"),teacher,booking(103,start,end,20),409);
        assertTrue(conflict.path("message").asText().contains("Giáo viên"));
        call(get("/api/classroom/bookings").param("roomId","102"),admin,null,200).path("data").forEach(row->assertEquals(102,row.path("room_id").asInt()));
        call(post("/api/classroom/bookings"),teacher,booking(101,end,end.plusHours(1),20),200);
    }
    @Test void pendingBookingsReserveRoomAndApprovedUsageIsClippedToWindow() throws Exception {
        var start=ClassroomService.now().plusDays(1).withNano(0); var end=start.plusHours(2);
        long id=call(post("/api/classroom/bookings"),admin,booking(102,start,start.plusHours(1),25),200).path("data").path("id").asLong();
        var pending=find(overview(start,end),102);
        assertFalse(pending.path("available_in_window").asBoolean()); assertEquals("AVAILABLE",pending.path("usage_status").asText()); assertEquals(0,pending.path("booking_rate").asDouble());
        call(patch("/api/classroom/bookings/"+id),admin,Map.of("status","APPROVED","note","Duyệt"),200);
        var approved=find(overview(start,end),102);
        assertEquals(60,approved.path("booked_minutes").asDouble()); assertEquals(50,approved.path("booking_rate").asDouble());
        assertEquals(102,approved.path("next_booking").path("room_id").asInt());
        assertEquals(100,find(overview(start.plusMinutes(15),start.plusMinutes(45)),102).path("booking_rate").asDouble());
    }
    @Test void currentLessonAndPhysicalControlAreScopedTo101() throws Exception {
        var now=ClassroomService.now().withNano(0); var future=now.plusDays(1);
        long id=call(post("/api/classroom/bookings"),teacher,booking(102,future,future.plusHours(1),20),200).path("data").path("id").asLong();
        db.update("UPDATE classroom_bookings SET status='APPROVED',starts_at=?,ends_at=? WHERE id=?",now.minusMinutes(10),now.plusMinutes(20),id);
        var data=overview(now,now.plusHours(1));
        assertEquals("IN_USE",find(data,102).path("usage_status").asText()); assertEquals("AVAILABLE",find(data,101).path("usage_status").asText());
        assertFalse(call(get("/api/classroom/permission"),teacher,null,200).path("data").path("allowed").asBoolean());
        assertFalse(call(get("/api/classroom/permission").param("roomId","102"),admin,null,200).path("data").path("allowed").asBoolean());
        call(post("/api/control"),teacher,Map.of("target","FAN","action","ON"),403);
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM classroom_command_attempts",Integer.class));
    }
    @Test void maintenanceBlocksBookingApprovalAndControlButPreservesHistory() throws Exception {
        var start=ClassroomService.now().plusDays(1).withNano(0);
        long id=call(post("/api/classroom/bookings"),teacher,booking(101,start,start.plusHours(1),20),200).path("data").path("id").asLong();
        call(put("/api/building/rooms/101"),admin,room(101,"MAINTENANCE",40),409);
        assertEquals(1,call(get("/api/building/rooms/101/impact"),admin,null,200).path("data").size());
        call(put("/api/building/rooms/101?cancelAffectedBookings=true"),admin,room(101,"MAINTENANCE",40),200);
        call(patch("/api/classroom/bookings/"+id),admin,Map.of("status","APPROVED","note","Duyệt"),409);
        call(post("/api/classroom/bookings"),admin,booking(101,start.plusHours(2),start.plusHours(3),20),409);
        call(post("/api/control"),admin,Map.of("target","LIGHT","action","OFF"),403);
        assertEquals("CANCELLED",db.queryForObject("SELECT status FROM classroom_bookings WHERE id=?",String.class,id));
        assertEquals("MAINTENANCE",find(overview(start,start.plusHours(1)),101).path("usage_status").asText());
        assertEquals(1,call(get("/api/building/rooms/101/events"),admin,null,200).path("data").size());
    }
    @Test void roomManagementCapacityAndAuditAreAdminOnly() throws Exception {
        call(post("/api/building/rooms"),teacher,room(401,"ACTIVE",50),403);
        call(post("/api/building/rooms"),admin,room(401,"ACTIVE",50),200);
        call(post("/api/building/rooms"),admin,room(401,"ACTIVE",50),409);
        call(get("/api/building/rooms/401/events"),student,null,403);
        var start=ClassroomService.now().plusDays(1).withNano(0);
        call(post("/api/classroom/bookings"),admin,booking(401,start,start.plusHours(1),51),400);
        call(post("/api/classroom/bookings"),admin,booking(401,start,start.plusHours(1),45),200);
        call(put("/api/building/rooms/401"),admin,room(401,"ACTIVE",40),409);
        call(put("/api/building/rooms/401?cancelAffectedBookings=true"),admin,room(401,"INACTIVE",50),200);
        assertEquals(2,call(get("/api/building/rooms/401/events"),admin,null,200).path("data").size());
    }
    @Test void nonIotReportsAndIncidentsNeverBorrow101SensorOrDevice() throws Exception {
        var now=ClassroomService.now().withNano(0); var future=now.plusDays(1);
        long id=call(post("/api/classroom/bookings"),admin,booking(102,future,future.plusHours(1),20),200).path("data").path("id").asLong();
        db.update("UPDATE classroom_bookings SET starts_at=?,ends_at=? WHERE id=?",now.minusMinutes(10),now.plusMinutes(10),id);
        db.update("INSERT INTO telemetry(device_id,temp,`timestamp`) VALUES ('node1_sensor',30,?)",now);
        var report=call(get("/api/classroom/bookings/"+id+"/report"),admin,null,200).path("data");
        assertFalse(report.path("iotEnabled").asBoolean()); assertEquals(0,report.path("environment").path("samples").asInt()); assertTrue(report.path("environment").path("average_temp").isNull());
        call(post("/api/classroom/incidents"),teacher,Map.of("roomId",102,"title","Sự cố","description","Kiểm tra","deviceId","node1_sensor"),400);
        call(post("/api/classroom/incidents"),teacher,Map.of("roomId",102,"title","Hỏng bảng","description","Bảng bị nứt"),200);
        assertEquals(0,call(get("/api/classroom/incidents").param("roomId","101"),teacher,null,200).path("data").size());
        assertEquals(1,call(get("/api/classroom/incidents").param("roomId","102"),teacher,null,200).path("data").size());
    }
    @Test void staleSensorIsExplicitAndInvalidIntervalsAreRejected() throws Exception {
        var now=ClassroomService.now().withNano(0);
        db.update("INSERT INTO telemetry(device_id,temp,`timestamp`) VALUES ('node1_sensor',30,?)",now.minusMinutes(10));
        assertEquals("STALE",find(overview(now,now.plusHours(1)),101).path("sensor_status").asText());
        call(get("/api/building/overview").param("from",now.toString()),admin,null,400);
        call(get("/api/building/overview").param("from",now.toString()).param("to",now.minusMinutes(1).toString()),admin,null,400);
        call(get("/api/classroom/bookings").param("roomId","999"),admin,null,404);
    }
}
