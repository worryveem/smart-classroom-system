package iot.iot;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
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
class RoomIotIntegrationTests {
    static final NodeRedStub STUB=new NodeRedStub();
    @DynamicPropertySource static void properties(DynamicPropertyRegistry props) {
        props.add("spring.datasource.url",()->MySqlTestSupport.url("_iot"));
        props.add("app.jwt.secret",MySqlTestSupport::jwtSecret);
        props.add("app.nodered.base-url",STUB::baseUrl);
        props.add("app.nodered.connect-timeout",()->500);
        props.add("app.nodered.read-timeout",()->1000);
    }
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper mapper;
    String admin,teacher,student;
    @AfterAll static void close() { STUB.close(); }
    String login(String name,String password) throws Exception {
        var response=mvc.perform(post("/api/auth/login").contentType("application/json").content(mapper.writeValueAsString(java.util.Map.of("username",name,"password",password))))
            .andExpect(status().isOk()).andReturn();
        return "Bearer "+mapper.readTree(response.getResponse().getContentAsString()).path("data").path("accessToken").asText();
    }
    @BeforeEach void setup() throws Exception {
        STUB.calls.clear();
        for(String table:List.of("classroom_command_attempts","classroom_bookings","telemetry","command_logs")) db.update("DELETE FROM "+table);
        db.update("UPDATE classroom_rooms SET status='ACTIVE',maintenance_note='' WHERE id=101");
        db.update("UPDATE devices SET room_id=101,type='ACTUATOR',status='Active' WHERE device_id='node2_actuator'");
        db.update("UPDATE classroom_settings SET sensor_device_id='node1_sensor' WHERE id=1");
        admin=login("admin","Admin@12345"); teacher=login("teacher","Teacher@12345"); student=login("student","Student@12345");
    }
    @Test void registeredDevicesAreScopedToTheirRoomWithoutEnablingUnconfiguredHardware() throws Exception {
        db.update("INSERT INTO devices(device_id,room_id,type,status) VALUES ('inventory_room102',102,'SENSOR','Active')");
        try {
            mvc.perform(get("/api/iot/rooms/102").header("Authorization",admin)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.iotEnabled").value(false))
                .andExpect(jsonPath("$.data.devices.length()").value(1))
                .andExpect(jsonPath("$.data.devices[0].device_id").value("inventory_room102"));
            mvc.perform(get("/api/iot/rooms/101").header("Authorization",admin)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.devices[*].device_id").value(org.hamcrest.Matchers.hasItems("node1_sensor","node2_actuator")))
                .andExpect(jsonPath("$.data.devices[*].device_id").value(org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("inventory_room102"))));
            mvc.perform(get("/api/iot/rooms/102/state").header("Authorization",admin)).andExpect(status().isConflict());
            assertTrue(STUB.calls.isEmpty());
        } finally { db.update("DELETE FROM devices WHERE device_id='inventory_room102'"); }
    }
    @Test void roomsWithoutHardwareAndUnknownRoomsNeverReachNodeRed() throws Exception {
        mvc.perform(get("/api/iot/rooms/102").header("Authorization",admin)).andExpect(status().isOk())
            .andExpect(jsonPath("$.data.id").value(102)).andExpect(jsonPath("$.data.iotEnabled").value(false)).andExpect(jsonPath("$.data.sensorId").isEmpty());
        for(String suffix:List.of("/state","/telemetry")) mvc.perform(get("/api/iot/rooms/102"+suffix).header("Authorization",admin)).andExpect(status().isConflict());
        mvc.perform(post("/api/iot/rooms/102/control").header("Authorization",admin).contentType("application/json").content("{\"target\":\"FAN\",\"action\":\"ON\"}")).andExpect(status().isConflict());
        mvc.perform(post("/api/control").param("roomId","102").header("Authorization",admin).contentType("application/json").content("{\"target\":\"FAN\",\"action\":\"ON\"}")).andExpect(status().isConflict());
        mvc.perform(get("/api/state").param("roomId","102").header("Authorization",admin)).andExpect(status().isConflict());
        mvc.perform(get("/api/iot/rooms/999").header("Authorization",admin)).andExpect(status().isNotFound());
        assertTrue(STUB.calls.isEmpty()); assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM classroom_command_attempts",Integer.class));
    }
    @Test void physicalRoomUsesExistingWireContractAndCorrelatedAck() throws Exception {
        mvc.perform(get("/api/iot/rooms/101").header("Authorization",admin)).andExpect(jsonPath("$.data.iotEnabled").value(true)).andExpect(jsonPath("$.data.sensorId").value("node1_sensor")).andExpect(jsonPath("$.data.actuatorId").value("node2_actuator"));
        STUB.reply(200,"{\"node1_sensor\":{\"temp\":29},\"node2_actuator\":{\"FAN\":false}}");
        mvc.perform(get("/api/iot/rooms/101/state").header("Authorization",admin)).andExpect(status().isOk()).andExpect(jsonPath("$.data.node1_sensor.temp").value(29));
        assertEquals("/smarthome/api/state",STUB.calls.get(0).path()); STUB.calls.clear();
        STUB.reply(200,"{\"msg\":\"SUCCESS\",\"device_id\":\"node2_actuator\",\"target\":\"FAN\",\"action\":\"ON\"}");
        mvc.perform(post("/api/iot/rooms/101/control").header("Authorization",admin).contentType("application/json").content("{\"target\":\"FAN\",\"action\":\"ON\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("SUCCESS"));
        assertEquals(1,STUB.calls.size()); assertEquals(mapper.readTree("{\"target\":\"FAN\",\"action\":\"ON\"}"),mapper.readTree(STUB.calls.get(0).body()));
        assertEquals(101,db.queryForObject("SELECT room_id FROM classroom_command_attempts",Integer.class));
    }
    @Test void relocatedOrSuspendedActuatorCannotReceiveCommands() throws Exception {
        for(String change:List.of("room_id=102","room_id=101,status='Suspended'","room_id=101,status='Active',type='SENSOR'")) {
            db.update("UPDATE devices SET "+change+" WHERE device_id='node2_actuator'");
            mvc.perform(get("/api/classroom/permission").header("Authorization",admin)).andExpect(jsonPath("$.data.allowed").value(false));
            mvc.perform(post("/api/iot/rooms/101/control").header("Authorization",admin).contentType("application/json").content("{\"target\":\"FAN\",\"action\":\"ON\"}")).andExpect(status().isConflict());
        }
        assertTrue(STUB.calls.isEmpty()); assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM classroom_command_attempts",Integer.class));
    }
    @Test void bookingOtherRoomStudentAndMaintenanceDoNotGrantPhysicalControl() throws Exception {
        db.update("INSERT INTO classroom_bookings(owner_id,owner_name,title,starts_at,ends_at,status,room_id) SELECT id,username,'Other room',DATE_SUB(NOW(),INTERVAL 1 HOUR),DATE_ADD(NOW(),INTERVAL 1 HOUR),'APPROVED',102 FROM users WHERE username='teacher'");
        for(String actor:List.of(teacher,student)) mvc.perform(post("/api/iot/rooms/101/control").header("Authorization",actor).contentType("application/json").content("{\"target\":\"FAN\",\"action\":\"ON\"}")).andExpect(status().isForbidden());
        db.update("UPDATE classroom_rooms SET status='MAINTENANCE' WHERE id=101");
        mvc.perform(post("/api/iot/rooms/101/control").header("Authorization",admin).contentType("application/json").content("{\"target\":\"FAN\",\"action\":\"ON\"}")).andExpect(status().isForbidden());
        assertTrue(STUB.calls.isEmpty());
    }
    @Test void telemetryBindingComesFromBackendAndRejectsWrongRoomSensor() throws Exception {
        db.update("INSERT IGNORE INTO devices(device_id,room_id,type,status) VALUES ('custom_sensor',101,'SENSOR','Active')");
        db.update("UPDATE devices SET room_id=101 WHERE device_id='custom_sensor'");
        db.update("UPDATE classroom_settings SET sensor_device_id='custom_sensor' WHERE id=1");
        db.update("INSERT INTO telemetry(device_id,temp) VALUES ('custom_sensor',27),('node1_sensor',99)");
        mvc.perform(get("/api/iot/rooms/101").header("Authorization",admin)).andExpect(jsonPath("$.data.sensorId").value("custom_sensor"));
        mvc.perform(get("/api/iot/rooms/101/telemetry").header("Authorization",admin).param("deviceId","node1_sensor"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1)).andExpect(jsonPath("$.data[0].temp").value(27));
        db.update("UPDATE devices SET room_id=102 WHERE device_id='custom_sensor'");
        mvc.perform(get("/api/iot/rooms/101/state").header("Authorization",admin)).andExpect(status().isConflict());
        assertTrue(STUB.calls.isEmpty());
    }
}
