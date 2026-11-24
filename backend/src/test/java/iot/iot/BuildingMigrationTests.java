package iot.iot;

import java.sql.DriverManager;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfEnvironmentVariable(named="SMARTCLASS_MYSQL_TEST_URL",matches=".+")
class BuildingMigrationTests {
    @Test void upgradeFromSingleRoomPreservesExistingOperationalAndIotData() throws Exception {
        String url=MySqlTestSupport.url("_upgrade");
        String user=System.getenv("DB_USERNAME"),password=System.getenv("DB_PASSWORD");
        Flyway.configure().dataSource(url,user,password).target("2").load().migrate();
        try(var connection=DriverManager.getConnection(url,user,password); var statement=connection.createStatement()) {
            statement.executeUpdate("INSERT INTO devices(device_id,room_id,type,status) VALUES ('upgrade_sensor',101,'SENSOR','Active')");
            statement.executeUpdate("INSERT INTO telemetry(device_id,temp,`timestamp`) VALUES ('upgrade_sensor',28.5,'2026-11-08 08:00:00')");
            statement.executeUpdate("INSERT INTO classroom_bookings(owner_id,owner_name,title,starts_at,ends_at,status) VALUES (9,'legacy_teacher','Lịch cũ','2026-11-09 08:00:00','2026-11-09 09:00:00','APPROVED')");
            statement.executeUpdate("INSERT INTO classroom_incidents(reporter_id,reporter_name,title,description) VALUES (9,'legacy_teacher','Sự cố cũ','Giữ nguyên nội dung')");
            statement.executeUpdate("INSERT INTO classroom_command_attempts(actor_id,actor_name,target,action,status) VALUES (9,'legacy_teacher','FAN','ON','SUCCESS')");
            statement.executeUpdate("INSERT INTO classroom_alerts(kind,message) VALUES ('SENSOR_OFFLINE','Cảnh báo cũ')");
        }
        Flyway.configure().dataSource(url,user,password).load().migrate();
        try(var connection=DriverManager.getConnection(url,user,password); var statement=connection.createStatement()) {
            for(String table:new String[]{"classroom_bookings","classroom_incidents","classroom_alerts","classroom_command_attempts"}) {
                try(var rows=statement.executeQuery("SELECT room_id FROM "+table)) { assertTrue(rows.next()); assertEquals(101,rows.getInt(1)); assertFalse(rows.next()); }
            }
            try(var rows=statement.executeQuery("SELECT status,title,expected_attendees FROM classroom_bookings")) {
                assertTrue(rows.next()); assertEquals("APPROVED",rows.getString(1)); assertEquals("Lịch cũ",rows.getString(2)); assertEquals(1,rows.getInt(3));
            }
            try(var rows=statement.executeQuery("SELECT device_id,temp FROM telemetry")) {
                assertTrue(rows.next()); assertEquals("upgrade_sensor",rows.getString(1)); assertEquals(28.5,rows.getDouble(2)); assertFalse(rows.next());
            }
            try(var rows=statement.executeQuery("SELECT COUNT(*) FROM classroom_rooms")) { assertTrue(rows.next()); assertEquals(15,rows.getInt(1)); }
        }
    }
}
