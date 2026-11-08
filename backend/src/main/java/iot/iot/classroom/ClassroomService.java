package iot.iot.classroom;

import iot.iot.entity.UserRole;
import iot.iot.exception.AdminOperationException;
import iot.iot.security.user.CustomUserDetails;
import iot.iot.integration.nodered.NodeRedProperties;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static org.springframework.http.HttpStatus.*;
import static iot.iot.classroom.ClassroomDtos.*;

@Service
@Transactional(readOnly=true)
public class ClassroomService {
    private final JdbcTemplate db;
    private final BuildingService building;
    private final NodeRedProperties nodeRed;
    public ClassroomService(JdbcTemplate db,BuildingService building,NodeRedProperties nodeRed) { this.db = db; this.building=building; this.nodeRed=nodeRed; }
    private static int roomId(Integer id) { return id==null?101:id; }
    public static LocalDateTime now() { return LocalDateTime.now(ZoneId.of("Asia/Ho_Chi_Minh")); }
    private void admin(CustomUserDetails actor) {
        if (actor.getRole() != UserRole.ADMIN) throw new AccessDeniedException("Forbidden");
    }
    private void staff(CustomUserDetails actor) {
        if (actor.getRole() == UserRole.STUDENT) throw new AccessDeniedException("Forbidden");
    }
    private void lockRoom() { db.queryForObject("SELECT id FROM classroom_settings WHERE id=1 FOR UPDATE", Integer.class); }
    public Map<String,Object> settings() { return db.queryForMap("SELECT * FROM classroom_settings WHERE id=1"); }
    @Transactional
    public Map<String,Object> updateSettings(Settings input, CustomUserDetails actor) {
        admin(actor); lockRoom();
        if (db.queryForObject("SELECT COUNT(*) FROM devices WHERE device_id=? AND type='SENSOR' AND room_id=101", Long.class, input.sensorDeviceId()) == 0)
            throw new AdminOperationException(BAD_REQUEST, "Cảm biến phải tồn tại và được gán cho phòng 101");
        if (input.sustainedSeconds() >= input.offlineSeconds())
            throw new AdminOperationException(BAD_REQUEST, "Thời gian mất kết nối phải lớn hơn thời gian duy trì ngưỡng");
        db.update("UPDATE classroom_settings SET name=?,sensor_device_id=?,temperature_limit=?,minimum_lux=?,sustained_seconds=?,offline_seconds=? WHERE id=1",
            input.name().trim(), input.sensorDeviceId(), input.temperatureLimit(), input.minimumLux(), input.sustainedSeconds(), input.offlineSeconds());
        return settings();
    }
    private long insert(String sql, Object... args) {
        var key = new GeneratedKeyHolder();
        db.update(connection -> {
            var statement = connection.prepareStatement(sql, java.sql.Statement.RETURN_GENERATED_KEYS);
            for (int i=0; i<args.length; i++) statement.setObject(i+1,args[i]);
            return statement;
        },key);
        return Objects.requireNonNull(key.getKey()).longValue();
    }
    public List<Map<String,Object>> bookings(LocalDateTime from, LocalDateTime to, int roomId) {
        building.requireRoom(roomId);
        if (from == null) from = now().toLocalDate().atStartOfDay().minusDays(7);
        if (to == null) to = from.plusDays(45);
        if (!to.isAfter(from) || Duration.between(from,to).compareTo(Duration.ofDays(93))>0)
            throw new AdminOperationException(BAD_REQUEST,"Khoảng lịch phải từ 1 đến 93 ngày");
        return db.queryForList("SELECT * FROM classroom_bookings WHERE room_id=? AND starts_at < ? AND ends_at > ? ORDER BY starts_at,id LIMIT 500",roomId,to,from);
    }
    private Map<String,Object> booking(long id) {
        var rows=db.queryForList("SELECT * FROM classroom_bookings WHERE id=?",id);
        if(rows.isEmpty()) throw new AdminOperationException(NOT_FOUND,"Không tìm thấy lịch sử dụng");
        return rows.get(0);
    }
    private void rejectOverlap(LocalDateTime start, LocalDateTime end, long exceptId, int roomId, long ownerId) {
        if(db.queryForObject("SELECT COUNT(*) FROM classroom_bookings WHERE room_id=? AND status IN ('PENDING','APPROVED') AND starts_at < ? AND ends_at > ? AND id<>?",
            Long.class,roomId,end,start,exceptId)>0) throw new AdminOperationException(CONFLICT,"Khung giờ đã có lịch chờ duyệt hoặc được duyệt trong phòng này");
        if(db.queryForObject("SELECT COUNT(*) FROM classroom_bookings b JOIN users u ON u.id=b.owner_id WHERE b.owner_id=? AND u.role='TEACHER' AND b.status IN ('PENDING','APPROVED') AND b.starts_at<? AND b.ends_at>? AND b.id<>?",Long.class,ownerId,end,start,exceptId)>0)
            throw new AdminOperationException(CONFLICT,"Giáo viên đã có lịch tại phòng khác trong khung giờ này");
    }
    @Transactional
    public Map<String,Object> createBooking(BookingInput input, CustomUserDetails actor) {
        staff(actor); lockRoom();
        int selected=roomId(input.roomId()); var room=building.requireAvailableRoom(selected);
        int attendees=input.expectedAttendees()==null?1:input.expectedAttendees();
        if(attendees>((Number)room.get("capacity")).intValue()) throw new AdminOperationException(BAD_REQUEST,"Sĩ số vượt sức chứa của phòng");
        if (!input.startsAt().isAfter(now()) || !input.endsAt().isAfter(input.startsAt())
            || Duration.between(input.startsAt(),input.endsAt()).compareTo(Duration.ofHours(12))>0)
            throw new AdminOperationException(BAD_REQUEST,"Lịch phải ở tương lai, kết thúc sau bắt đầu và tối đa 12 giờ");
        rejectOverlap(input.startsAt(),input.endsAt(),0,selected,actor.getId());
        long id=insert("INSERT INTO classroom_bookings(owner_id,owner_name,title,starts_at,ends_at,room_id,expected_attendees) VALUES (?,?,?,?,?,?,?)",
            actor.getId(),actor.getUsername(),input.title().trim(),input.startsAt(),input.endsAt(),selected,attendees);
        return booking(id);
    }
    @Transactional
    public Map<String,Object> decide(long id, BookingDecision input, CustomUserDetails actor) {
        lockRoom(); var row=booking(id); String status=(String)row.get("status");
        boolean owner=((Number)row.get("owner_id")).longValue()==actor.getId();
        if(input.status()==Decision.CANCELLED) { if(!owner && actor.getRole()!=UserRole.ADMIN) throw new AccessDeniedException("Forbidden"); }
        else admin(actor);
        if(!List.of("PENDING","APPROVED").contains(status) || !time(row.get("ends_at")).isAfter(now()))
            throw new AdminOperationException(CONFLICT,"Lịch đã kết thúc hoặc không còn cho phép thay đổi");
        if(input.status()!=Decision.CANCELLED && !status.equals("PENDING"))
            throw new AdminOperationException(CONFLICT,"Chỉ duyệt hoặc từ chối lịch đang chờ");
        if(input.status()==Decision.APPROVED) {
            int selected=((Number)row.get("room_id")).intValue();
            building.requireAvailableRoom(selected);
            rejectOverlap(time(row.get("starts_at")),time(row.get("ends_at")),id,selected,((Number)row.get("owner_id")).longValue());
        }
        db.update("UPDATE classroom_bookings SET status=?,decision_note=? WHERE id=?",input.status().name(),input.note().trim(),id);
        return booking(id);
    }
    public Map<String,Object> permission(CustomUserDetails actor) {
        return permission(actor,101);
    }
    public Map<String,Object> permission(CustomUserDetails actor,int roomId) {
        var room=building.requireRoom(roomId);
        if(roomId!=101) return Map.of("allowed",false,"reason","Phòng chưa kết nối thiết bị IoT; không hỗ trợ điều khiển","bookingId",0);
        if(!room.get("status").equals("ACTIVE")) return Map.of("allowed",false,"reason","Phòng 101 đang bảo trì hoặc tạm ngưng sử dụng","bookingId",0);
        if(actor.getRole()==UserRole.STUDENT) return Map.of("allowed",false,"reason","Sinh viên chỉ được xem dữ liệu","bookingId",0);
        if(db.queryForObject("SELECT COUNT(*) FROM devices WHERE device_id=? AND room_id=101 AND type='ACTUATOR' AND status='Active'",Integer.class,nodeRed.actuatorDeviceId())==0)
            return Map.of("allowed",false,"reason","Bộ điều khiển không thuộc phòng 101 hoặc đang bị đình chỉ/offline","bookingId",0);
        var time=now(); boolean isAdmin=actor.getRole()==UserRole.ADMIN;
        var current=db.queryForList("SELECT id FROM classroom_bookings WHERE room_id=? AND (?=1 OR owner_id=?) AND status='APPROVED' AND starts_at<=? AND ends_at>? ORDER BY id LIMIT 1",roomId,isAdmin?1:0,actor.getId(),time,time);
        return Map.of("allowed",isAdmin || !current.isEmpty(),"reason",isAdmin?"Quản trị viên được điều khiển phòng":current.isEmpty()?"Bạn cần lịch đã duyệt đang trong giờ sử dụng":"Đang trong ca được cấp quyền",
            "bookingId",current.isEmpty()?0:current.get(0).get("id"));
    }
    public List<Map<String,Object>> incidents(CustomUserDetails actor,int roomId) {
        building.requireRoom(roomId);
        return actor.getRole()==UserRole.ADMIN ? db.queryForList("SELECT * FROM classroom_incidents WHERE room_id=? ORDER BY id DESC LIMIT 200",roomId) :
            db.queryForList("SELECT * FROM classroom_incidents WHERE room_id=? AND reporter_id=? ORDER BY id DESC LIMIT 200",roomId,actor.getId());
    }
    private Map<String,Object> incident(long id, CustomUserDetails actor) {
        var rows=db.queryForList("SELECT * FROM classroom_incidents WHERE id=?",id);
        if(rows.isEmpty()) throw new AdminOperationException(NOT_FOUND,"Không tìm thấy sự cố");
        var row=rows.get(0);
        if(actor.getRole()!=UserRole.ADMIN && ((Number)row.get("reporter_id")).longValue()!=actor.getId()) throw new AccessDeniedException("Forbidden");
        return row;
    }
    public List<Map<String,Object>> incidentEvents(long id, CustomUserDetails actor) {
        incident(id,actor);
        return db.queryForList("SELECT * FROM classroom_incident_events WHERE incident_id=? ORDER BY id",id);
    }
    @Transactional
    public Map<String,Object> createIncident(IncidentInput input, CustomUserDetails actor) {
        int selected=roomId(input.roomId()); building.requireRoom(selected);
        if(input.deviceId()!=null && !input.deviceId().isBlank() && db.queryForObject("SELECT COUNT(*) FROM devices WHERE device_id=? AND room_id=?",Long.class,input.deviceId(),selected)==0)
            throw new AdminOperationException(BAD_REQUEST,"Thiết bị không tồn tại trong phòng đã chọn");
        long id=insert("INSERT INTO classroom_incidents(reporter_id,reporter_name,title,description,device_id,room_id) VALUES (?,?,?,?,?,?)",
            actor.getId(),actor.getUsername(),input.title().trim(),input.description().trim(),input.deviceId()==null || input.deviceId().isBlank()?null:input.deviceId(),selected);
        db.update("INSERT INTO classroom_incident_events(incident_id,status,note,actor) VALUES (?,'OPEN',?,?)",id,"Tạo báo cáo sự cố",actor.getUsername());
        return incident(id,actor);
    }
    @Transactional
    public Map<String,Object> updateIncident(long id, IncidentUpdate input, CustomUserDetails actor) {
        admin(actor); lockRoom(); var row=incident(id,actor);
        if(row.get("status").equals(input.status().name())) throw new AdminOperationException(CONFLICT,"Sự cố đã ở trạng thái này");
        db.update("UPDATE classroom_incidents SET status=?,resolution=?,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",input.status().name(),input.note().trim(),actor.getUsername(),id);
        db.update("INSERT INTO classroom_incident_events(incident_id,status,note,actor) VALUES (?,?,?,?)",id,input.status().name(),input.note().trim(),actor.getUsername());
        return incident(id,actor);
    }
    public List<Map<String,Object>> alerts(int roomId) {
        building.requireRoom(roomId);
        return db.queryForList("SELECT * FROM classroom_alerts WHERE room_id=? ORDER BY ended_at IS NULL DESC,id DESC LIMIT 200",roomId);
    }
    @Transactional
    public void acknowledge(long id, CustomUserDetails actor) {
        staff(actor);
        if(db.update("UPDATE classroom_alerts SET acknowledged_at=CURRENT_TIMESTAMP,acknowledged_by=? WHERE id=? AND acknowledged_at IS NULL",actor.getUsername(),id)==0)
            throw new AdminOperationException(CONFLICT,"Cảnh báo không tồn tại hoặc đã được xác nhận");
    }
    public Map<String,Object> report(long id, CustomUserDetails actor) {
        var row=booking(id); staff(actor);
        if(actor.getRole()!=UserRole.ADMIN && ((Number)row.get("owner_id")).longValue()!=actor.getId()) throw new AccessDeniedException("Forbidden");
        var config=settings();
        boolean iot=((Number)row.get("room_id")).intValue()==101;
        var stats=db.queryForMap("SELECT COUNT(*) AS samples,AVG(temp) AS average_temp,MIN(temp) AS minimum_temp,MAX(temp) AS maximum_temp,AVG(humid) AS average_humid,AVG(lux) AS average_lux,COALESCE(SUM(CASE WHEN temp>? THEN 1 ELSE 0 END),0) AS hot_samples,COALESCE(SUM(CASE WHEN occupancy=1 AND lux<? THEN 1 ELSE 0 END),0) AS dark_occupied_samples FROM telemetry WHERE ?=1 AND device_id IN (SELECT device_id FROM devices WHERE room_id=101 AND type='SENSOR') AND device_id=? AND `timestamp`>=? AND `timestamp`<?",
            config.get("temperature_limit"),config.get("minimum_lux"),iot?1:0,config.get("sensor_device_id"),row.get("starts_at"),row.get("ends_at"));
        var attempts=db.queryForList("SELECT status,COUNT(*) AS total FROM classroom_command_attempts WHERE booking_id=? GROUP BY status",id);
        var alertRows=db.queryForList("SELECT * FROM classroom_alerts WHERE room_id=? AND started_at<? AND (ended_at IS NULL OR ended_at>=?) ORDER BY id",row.get("room_id"),row.get("ends_at"),row.get("starts_at"));
        return Map.of("booking",row,"environment",stats,"commands",attempts,"alerts",alertRows,"thresholds",config,"iotEnabled",iot,
            "note",iot?"Chỉ thống kê mẫu đo thật đã lưu; ngưỡng là cấu hình hiện tại, chưa lưu ảnh chụp theo buổi.":"Phòng chưa kết nối IoT. Báo cáo lịch sử dụng không có số liệu cảm biến; không dùng dữ liệu của phòng 101 thay thế.");
    }
    public List<Map<String,Object>> attempts(CustomUserDetails actor,int roomId) {
        staff(actor);
        building.requireRoom(roomId);
        return actor.getRole()==UserRole.ADMIN?db.queryForList("SELECT * FROM classroom_command_attempts WHERE room_id=? ORDER BY id DESC LIMIT 200",roomId):
            db.queryForList("SELECT * FROM classroom_command_attempts WHERE room_id=? AND actor_id=? ORDER BY id DESC LIMIT 200",roomId,actor.getId());
    }
    @Transactional
    public long beginAttempt(CustomUserDetails actor, String target, String action) {
        var permission=permission(actor);
        if(!Boolean.TRUE.equals(permission.get("allowed"))) throw new AccessDeniedException((String)permission.get("reason"));
        Number bookingId=(Number)permission.get("bookingId");
        return insert("INSERT INTO classroom_command_attempts(actor_id,actor_name,booking_id,target,action) VALUES (?,?,?,?,?)",
            actor.getId(),actor.getUsername(),bookingId.longValue()==0?null:bookingId.longValue(),target,action);
    }
    @Transactional
    public void finishAttempt(long id,String status,String logStatus,String message) {
        db.update("UPDATE classroom_command_attempts SET status=?,log_status=?,message=?,completed_at=CURRENT_TIMESTAMP WHERE id=?",status,logStatus,message.substring(0,Math.min(message.length(),500)),id);
    }
    public static LocalDateTime time(Object value) { return value instanceof Timestamp t?t.toLocalDateTime():(LocalDateTime)value; }
}
