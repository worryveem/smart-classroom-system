package iot.iot;

import com.fasterxml.jackson.databind.ObjectMapper;
import iot.iot.classroom.ClassroomAlertService;
import iot.iot.classroom.ClassroomService;
import java.util.*;
import java.util.concurrent.*;
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

@SpringBootTest(properties="app.classroom.alerts-enabled=false")
@ActiveProfiles("local")
@AutoConfigureMockMvc(print=MockMvcPrint.NONE)
@EnabledIfEnvironmentVariable(named="SMARTCLASS_MYSQL_TEST_URL",matches=".+")
class ClassroomIntegrationTests {
    @DynamicPropertySource static void properties(DynamicPropertyRegistry props) {
        props.add("spring.datasource.url",()->MySqlTestSupport.url("_classroom"));
        props.add("app.jwt.secret",MySqlTestSupport::jwtSecret);
    }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper mapper;
    @Autowired ClassroomAlertService alerts;
    String admin,teacher,student;
    String login(String username,String password) throws Exception {
        var result=mvc.perform(post("/api/auth/login").contentType("application/json").content(mapper.writeValueAsString(Map.of("username",username,"password",password))))
            .andExpect(status().isOk()).andReturn();
        return "Bearer "+mapper.readTree(result.getResponse().getContentAsString()).path("data").path("accessToken").asText();
    }
    @BeforeEach void setup() throws Exception {
        // This class can only run against its own isolated smartclass_verify_* database.
        for(String table:List.of("classroom_command_attempts","classroom_incident_events","classroom_incidents","classroom_alerts","classroom_bookings","telemetry")) db.update("DELETE FROM "+table);
        db.update("UPDATE classroom_settings SET sensor_device_id='node1_sensor',temperature_limit=32,minimum_lux=150,sustained_seconds=120,offline_seconds=300 WHERE id=1");
        admin=login("admin","Admin@12345"); teacher=login("teacher","Teacher@12345"); student=login("student","Student@12345");
    }
    String input(java.time.LocalDateTime start,java.time.LocalDateTime end) throws Exception {
        return mapper.writeValueAsString(Map.of("title","Buổi thực hành","startsAt",start.toString(),"endsAt",end.toString()));
    }
    long createFuture() throws Exception {
        var start=ClassroomService.now().plusDays(1).withNano(0);
        var result=mvc.perform(post("/api/classroom/bookings").header("Authorization",teacher).contentType("application/json").content(input(start,start.plusHours(1))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("PENDING")).andReturn();
        return mapper.readTree(result.getResponse().getContentAsString()).path("data").path("id").asLong();
    }
    @Test void bookingOverlapAndApprovalAndCancellation() throws Exception {
        long id=createFuture();
        var start=ClassroomService.now().plusDays(1).plusMinutes(10).withNano(0);
        mvc.perform(post("/api/classroom/bookings").header("Authorization",teacher).contentType("application/json").content(input(start,start.plusHours(1)))).andExpect(status().isConflict());
        mvc.perform(patch("/api/classroom/bookings/"+id).header("Authorization",teacher).contentType("application/json").content("{\"status\":\"APPROVED\",\"note\":\"\"}")).andExpect(status().isForbidden());
        mvc.perform(patch("/api/classroom/bookings/"+id).header("Authorization",admin).contentType("application/json").content("{\"status\":\"APPROVED\",\"note\":\"Duyệt\"}")).andExpect(status().isOk());
        mvc.perform(patch("/api/classroom/bookings/"+id).header("Authorization",teacher).contentType("application/json").content("{\"status\":\"CANCELLED\",\"note\":\"Đổi ca\"}")).andExpect(status().isOk());
        mvc.perform(patch("/api/classroom/bookings/"+id).header("Authorization",admin).contentType("application/json").content("{\"status\":\"APPROVED\",\"note\":\"\"}")).andExpect(status().isConflict());
    }
    @Test void simultaneousBookingsReserveOnlyOneSlot() throws Exception {
        var start=ClassroomService.now().plusDays(2).withNano(0); String body=input(start,start.plusHours(1));
        var executor=Executors.newFixedThreadPool(2); var ready=new CountDownLatch(2); var go=new CountDownLatch(1);
        try {
            Callable<Integer> task=()-> { ready.countDown(); assertTrue(go.await(10,TimeUnit.SECONDS)); return mvc.perform(post("/api/classroom/bookings").header("Authorization",teacher).contentType("application/json").content(body)).andReturn().getResponse().getStatus(); };
            var first=executor.submit(task); var second=executor.submit(task); assertTrue(ready.await(10,TimeUnit.SECONDS)); go.countDown();
            assertEquals(Set.of(200,409),Set.of(first.get(15,TimeUnit.SECONDS),second.get(15,TimeUnit.SECONDS)));
        } finally { executor.shutdownNow(); }
    }
    @Test void permissionTracksApprovedWindowAndStudentsNeverControl() throws Exception {
        mvc.perform(get("/api/classroom/permission").header("Authorization",teacher)).andExpect(jsonPath("$.data.allowed").value(false));
        mvc.perform(post("/api/control").header("Authorization",teacher).contentType("application/json").content("{\"target\":\"FAN\",\"action\":\"ON\"}")).andExpect(status().isForbidden());
        long id=createFuture();
        db.update("UPDATE classroom_bookings SET status='APPROVED',starts_at=?,ends_at=? WHERE id=?",ClassroomService.now().minusMinutes(1),ClassroomService.now().plusMinutes(30),id);
        mvc.perform(get("/api/classroom/permission").header("Authorization",teacher)).andExpect(jsonPath("$.data.allowed").value(true)).andExpect(jsonPath("$.data.bookingId").value(id));
        mvc.perform(get("/api/classroom/permission").header("Authorization",student)).andExpect(jsonPath("$.data.allowed").value(false));
        mvc.perform(post("/api/control").header("Authorization",student).contentType("application/json").content("{\"target\":\"LIGHT\",\"action\":\"OFF\"}")).andExpect(status().isForbidden());
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM classroom_command_attempts",Integer.class));
        db.update("UPDATE classroom_bookings SET ends_at=? WHERE id=?",ClassroomService.now().minusSeconds(1),id);
        mvc.perform(get("/api/classroom/permission").header("Authorization",teacher)).andExpect(jsonPath("$.data.allowed").value(false));
    }
    @Test void invalidBookingsAndUnauthorizedSettingsAreRejected() throws Exception {
        var start=ClassroomService.now().plusDays(1);
        mvc.perform(post("/api/classroom/bookings").header("Authorization",student).contentType("application/json").content(input(start,start.plusHours(1)))).andExpect(status().isForbidden());
        mvc.perform(post("/api/classroom/bookings").header("Authorization",teacher).contentType("application/json").content(input(start,start.minusHours(1)))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/classroom/settings")).andExpect(status().isUnauthorized());
        String config="{\"name\":\"Phòng 101\",\"sensorDeviceId\":\"node1_sensor\",\"temperatureLimit\":33,\"minimumLux\":150,\"sustainedSeconds\":120,\"offlineSeconds\":300}";
        mvc.perform(put("/api/classroom/settings").header("Authorization",teacher).contentType("application/json").content(config)).andExpect(status().isForbidden());
        mvc.perform(put("/api/classroom/settings").header("Authorization",admin).contentType("application/json").content(config)).andExpect(status().isOk());
        mvc.perform(put("/api/classroom/settings").header("Authorization",admin).contentType("application/json").content(config.replace("node1_sensor","node2_actuator"))).andExpect(status().isBadRequest());
    }
    @Test void incidentOwnershipAndImmutableEventHistory() throws Exception {
        var result=mvc.perform(post("/api/classroom/incidents").header("Authorization",student).contentType("application/json").content("{\"title\":\"Quạt không quay\",\"description\":\"Kiểm tra bộ chấp hành\",\"deviceId\":\"node2_actuator\"}"))
            .andExpect(status().isOk()).andReturn();
        long id=mapper.readTree(result.getResponse().getContentAsString()).path("data").path("id").asLong();
        mvc.perform(get("/api/classroom/incidents/"+id+"/events").header("Authorization",teacher)).andExpect(status().isForbidden());
        mvc.perform(patch("/api/classroom/incidents/"+id).header("Authorization",student).contentType("application/json").content("{\"status\":\"RESOLVED\",\"note\":\"Đã sửa\"}")).andExpect(status().isForbidden());
        for(String state:List.of("IN_PROGRESS","RESOLVED")) mvc.perform(patch("/api/classroom/incidents/"+id).header("Authorization",admin).contentType("application/json").content("{\"status\":\""+state+"\",\"note\":\"Đã kiểm tra\"}")).andExpect(status().isOk());
        mvc.perform(get("/api/classroom/incidents/"+id+"/events").header("Authorization",student)).andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(3));
    }
    @Test void alertDeduplicationAcknowledgementAndRecoveryUseRealSamples() throws Exception {
        alerts.evaluate(); alerts.evaluate();
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM classroom_alerts WHERE ended_at IS NULL",Integer.class));
        long offline=db.queryForObject("SELECT id FROM classroom_alerts",Long.class);
        mvc.perform(post("/api/classroom/alerts/"+offline+"/acknowledge").header("Authorization",student)).andExpect(status().isForbidden());
        mvc.perform(post("/api/classroom/alerts/"+offline+"/acknowledge").header("Authorization",teacher)).andExpect(status().isForbidden());
        db.update("INSERT INTO classroom_bookings(owner_id,owner_name,title,starts_at,ends_at,status,room_id) SELECT id,username,'Ca trực',?,?,'APPROVED',101 FROM users WHERE username='teacher'",ClassroomService.now().minusMinutes(5),ClassroomService.now().plusMinutes(30));
        mvc.perform(post("/api/classroom/alerts/"+offline+"/acknowledge").header("Authorization",teacher)).andExpect(status().isOk());
        var now=ClassroomService.now().withNano(0);
        for(int seconds:new int[]{180,120,60,0}) db.update("INSERT INTO telemetry(device_id,temp,lux,occupancy,`timestamp`) VALUES ('node1_sensor',35,80,1,?)",now.minusSeconds(seconds));
        alerts.evaluate(); alerts.evaluate();
        assertEquals(2,db.queryForObject("SELECT COUNT(*) FROM classroom_alerts WHERE ended_at IS NULL",Integer.class));
        db.update("INSERT INTO telemetry(device_id,temp,lux,occupancy,`timestamp`) VALUES ('node1_sensor',25,500,0,?)",now.plusSeconds(1));
        // Force the recovery sample into the past without waiting for the system clock.
        db.update("UPDATE telemetry SET `timestamp`=DATE_SUB(`timestamp`,INTERVAL 2 SECOND)");
        alerts.evaluate();
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM classroom_alerts WHERE ended_at IS NULL",Integer.class));
    }
    @Test void reportAggregatesOnlyActualSensorSamplesWithinBooking() throws Exception {
        long id=createFuture(); var now=ClassroomService.now().withNano(0);
        db.update("UPDATE classroom_bookings SET starts_at=?,ends_at=?,status='APPROVED' WHERE id=?",now.minusHours(1),now.plusHours(1),id);
        for(int temp:List.of(25,35)) db.update("INSERT INTO telemetry(device_id,temp,humid,lux,occupancy,`timestamp`) VALUES ('node1_sensor',?,60,100,1,?)",temp,now);
        db.update("INSERT INTO telemetry(device_id,temp,`timestamp`) VALUES ('node1_sensor',99,?)",now.minusHours(2));
        mvc.perform(get("/api/classroom/bookings/"+id+"/report").header("Authorization",teacher)).andExpect(status().isOk())
            .andExpect(jsonPath("$.data.environment.samples").value(2)).andExpect(jsonPath("$.data.environment.average_temp").value(30))
            .andExpect(jsonPath("$.data.environment.hot_samples").value(1));
        mvc.perform(get("/api/classroom/bookings/"+id+"/report").header("Authorization",student)).andExpect(status().isForbidden());
    }
}
