package iot.iot.classroom;

import iot.iot.exception.AdminOperationException;
import iot.iot.integration.nodered.NodeRedProperties;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import static org.springframework.http.HttpStatus.*;

@Service
public class RoomIotAccess {
    private final BuildingService building;
    private final JdbcTemplate db;
    private final NodeRedProperties properties;
    public RoomIotAccess(BuildingService building,JdbcTemplate db,NodeRedProperties properties) {
        this.building=building; this.db=db; this.properties=properties;
    }
    public Map<String,Object> metadata(int roomId) {
        var room=building.requireRoom(roomId);
        room.put("iotEnabled",roomId==101);
        room.put("sensorId",roomId==101?sensorId():null);
        room.put("actuatorId",roomId==101?properties.actuatorDeviceId():null);
        return room;
    }
    public void requireInstalled(int roomId) {
        building.requireRoom(roomId);
        if(roomId!=101) throw new AdminOperationException(CONFLICT,"Phòng "+roomId+" chưa kết nối IoT; không đọc hoặc gửi lệnh tới thiết bị phòng khác");
    }
    public String sensorId() { return db.queryForObject("SELECT sensor_device_id FROM classroom_settings WHERE id=1",String.class); }
    public void requireSensor(int roomId) {
        requireInstalled(roomId);
        if(db.queryForObject("SELECT COUNT(*) FROM devices WHERE device_id=? AND room_id=? AND type='SENSOR'",Integer.class,sensorId(),roomId)==0)
            throw new AdminOperationException(CONFLICT,"Cấu hình cảm biến không thuộc phòng đã chọn");
    }
    public void requireActuator(int roomId) {
        requireInstalled(roomId);
        if(db.queryForObject("SELECT COUNT(*) FROM devices WHERE device_id=? AND room_id=? AND type='ACTUATOR' AND status='Active'",Integer.class,properties.actuatorDeviceId(),roomId)==0)
            throw new AdminOperationException(CONFLICT,"Bộ điều khiển không thuộc phòng đã chọn hoặc đang bị đình chỉ/offline");
    }
}
