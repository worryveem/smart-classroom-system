package iot.iot.classroom;

import iot.iot.entity.UserRole;
import iot.iot.exception.AdminOperationException;
import iot.iot.security.user.CustomUserDetails;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static org.springframework.http.HttpStatus.*;
import static iot.iot.classroom.ClassroomDtos.*;

@Service
@Transactional(readOnly=true)
public class BuildingService {
    private final JdbcTemplate db;
    public BuildingService(JdbcTemplate db) { this.db=db; }
    private void admin(CustomUserDetails actor) { if(actor.getRole()!=UserRole.ADMIN) throw new AccessDeniedException("Forbidden"); }
    public Map<String,Object> requireRoom(int id) {
        var rows=db.queryForList("SELECT * FROM classroom_rooms WHERE id=?",id);
        if(rows.isEmpty()) throw new AdminOperationException(NOT_FOUND,"Không tìm thấy phòng trong Nhà A");
        return rows.get(0);
    }
    public Map<String,Object> requireAvailableRoom(int id) {
        var room=requireRoom(id);
        if(!room.get("status").equals("ACTIVE")) throw new AdminOperationException(CONFLICT,"Phòng đang bảo trì hoặc tạm ngưng sử dụng");
        return room;
    }
    public List<Map<String,Object>> rooms() {
        return db.queryForList("SELECT *, (id=101) AS iot_enabled FROM classroom_rooms ORDER BY floor_number,id");
    }
    private void lock() { db.queryForObject("SELECT id FROM classroom_settings WHERE id=1 FOR UPDATE",Integer.class); }
    @Transactional
    public Map<String,Object> save(RoomInput input,CustomUserDetails actor,boolean create) {
        admin(actor); lock();
        if(input.status()!=RoomStatus.ACTIVE && input.note().isBlank()) throw new AdminOperationException(BAD_REQUEST,"Cần ghi lý do bảo trì hoặc tạm ngưng");
        if(create) {
            if(db.queryForObject("SELECT COUNT(*) FROM classroom_rooms",Integer.class)>=200) throw new AdminOperationException(CONFLICT,"Nhà A hỗ trợ tối đa 200 phòng");
            if(db.queryForObject("SELECT COUNT(*) FROM classroom_rooms WHERE id=?",Integer.class,input.roomId())>0) throw new AdminOperationException(CONFLICT,"Số phòng đã tồn tại");
            db.update("INSERT INTO classroom_rooms(id,name,floor_number,capacity,equipment,status,maintenance_note) VALUES (?,?,?,?,?,?,?)",input.roomId(),input.name().trim(),input.floor(),input.capacity(),input.equipment().trim(),input.status().name(),input.note().trim());
        } else {
            requireRoom(input.roomId());
            if(db.queryForObject("SELECT COUNT(*) FROM classroom_bookings WHERE room_id=? AND status IN ('PENDING','APPROVED') AND ends_at>? AND expected_attendees>?",Integer.class,input.roomId(),ClassroomService.now(),input.capacity())>0)
                throw new AdminOperationException(CONFLICT,"Sức chứa mới nhỏ hơn sĩ số của lịch chưa kết thúc");
            db.update("UPDATE classroom_rooms SET name=?,floor_number=?,capacity=?,equipment=?,status=?,maintenance_note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",input.name().trim(),input.floor(),input.capacity(),input.equipment().trim(),input.status().name(),input.note().trim(),input.roomId());
        }
        db.update("INSERT INTO classroom_room_events(room_id,actor,message) VALUES (?,?,?)",input.roomId(),actor.getUsername(),
            (create?"Tạo phòng: ":"Cập nhật phòng: ")+input.name().trim()+"; tầng "+input.floor()+"; sức chứa "+input.capacity()+"; trạng thái "+input.status()+"; thiết bị: "+input.equipment().trim()+"; ghi chú: "+input.note().trim());
        return requireRoom(input.roomId());
    }
    public List<Map<String,Object>> events(int id,CustomUserDetails actor) {
        admin(actor); requireRoom(id);
        return db.queryForList("SELECT * FROM classroom_room_events WHERE room_id=? ORDER BY id DESC LIMIT 100",id);
    }
    public Map<String,Object> overview(LocalDateTime from,LocalDateTime to) {
        var now=ClassroomService.now();
        if((from==null)!=(to==null)) throw new AdminOperationException(BAD_REQUEST,"Cần cả giờ bắt đầu và kết thúc tìm phòng");
        if(from==null) { from=now; to=now.plusHours(1); }
        if(!to.isAfter(from) || Duration.between(from,to).compareTo(Duration.ofDays(31))>0)
            throw new AdminOperationException(BAD_REQUEST,"Khoảng tìm phòng/thống kê phải lớn hơn 0 và tối đa 31 ngày");
        var settings=db.queryForMap("SELECT * FROM classroom_settings WHERE id=1");
        var telemetry=db.queryForList("SELECT temp,humid,lux,occupancy,`timestamp` FROM telemetry WHERE device_id IN (SELECT device_id FROM devices WHERE room_id=101 AND type='SENSOR') AND device_id=? AND `timestamp`<=? ORDER BY `timestamp` DESC,id DESC LIMIT 1",settings.get("sensor_device_id"),now);
        Map<String,Object> sensor=telemetry.isEmpty()?null:telemetry.get(0);
        boolean fresh=sensor!=null && Duration.between(ClassroomService.time(sensor.get("timestamp")),now).getSeconds()<=((Number)settings.get("offline_seconds")).longValue();
        var current=db.queryForList("SELECT * FROM classroom_bookings WHERE status='APPROVED' AND starts_at<=? AND ends_at>? ORDER BY starts_at,id",now,now);
        var upcoming=db.queryForList("SELECT * FROM (SELECT b.*,ROW_NUMBER() OVER(PARTITION BY room_id ORDER BY starts_at,id) AS position_in_room FROM classroom_bookings b WHERE status='APPROVED' AND starts_at>?) ranked WHERE position_in_room=1",now);
        var blocked=db.queryForList("SELECT room_id,COUNT(*) AS total FROM classroom_bookings WHERE status IN ('PENDING','APPROVED') AND starts_at<? AND ends_at>? GROUP BY room_id",to,from);
        var usage=db.queryForList("SELECT room_id,SUM(TIMESTAMPDIFF(SECOND,GREATEST(starts_at,?),LEAST(ends_at,?)))/60.0 AS booked_minutes FROM classroom_bookings WHERE status='APPROVED' AND starts_at<? AND ends_at>? GROUP BY room_id",from,to,to,from);
        var incidents=db.queryForList("SELECT room_id,COUNT(*) AS total FROM classroom_incidents WHERE status<>'RESOLVED' GROUP BY room_id");
        var alertCounts=db.queryForList("SELECT room_id,COUNT(*) AS total FROM classroom_alerts WHERE ended_at IS NULL GROUP BY room_id");
        var pending=db.queryForList("SELECT room_id,COUNT(*) AS total FROM classroom_bookings WHERE status='PENDING' AND ends_at>? GROUP BY room_id",now);
        var result=new ArrayList<Map<String,Object>>(); int inUse=0,available=0,maintenance=0;
        double windowMinutes=Duration.between(from,to).toNanos()/60000000000.0;
        for(var room:rooms()) {
            int id=((Number)room.get("id")).intValue(); boolean iot=id==101;
            var active=current.stream().filter(b->((Number)b.get("room_id")).intValue()==id).findFirst().orElse(null);
            var next=upcoming.stream().filter(b->((Number)b.get("room_id")).intValue()==id).findFirst().orElse(null);
            boolean open=room.get("status").equals("ACTIVE");
            String state=open?(active!=null?"IN_USE":"AVAILABLE"):(String)room.get("status");
            if(state.equals("IN_USE")) inUse++; if(state.equals("AVAILABLE")) available++; if(!open) maintenance++;
            room.put("usage_status",state); room.put("current_booking",active); room.put("next_booking",next);
            room.put("available_in_window",open && value(blocked,id,"total")==0);
            room.put("pending_bookings",value(pending,id,"total")); room.put("open_incidents",value(incidents,id,"total")); room.put("active_alerts",iot?value(alertCounts,id,"total"):0);
            double minutes=value(usage,id,"booked_minutes"); room.put("booked_minutes",minutes);
            room.put("booking_rate",Math.min(100,Math.round(minutes/windowMinutes*1000)/10.0));
            room.put("telemetry",iot?sensor:null); room.put("sensor_status",iot?(fresh?"ONLINE":sensor==null?"NO_DATA":"STALE"):"NOT_CONNECTED");
            room.put("occupancy_without_booking",iot && fresh && sensor!=null && Boolean.TRUE.equals(asBoolean(sensor.get("occupancy"))) && active==null);
            result.add(room);
        }
        return Map.of("building","Nhà A","asOf",now,"from",from,"to",to,"rooms",result,
            "summary",Map.of("total",result.size(),"inUse",inUse,"available",available,"unavailable",maintenance,
                "iotRooms",result.stream().filter(r->((Number)r.get("id")).intValue()==101).count(),"pending",pending.stream().mapToLong(p->((Number)p.get("total")).longValue()).sum()));
    }
    private static Boolean asBoolean(Object value) { return value instanceof Boolean b?b:value instanceof Number n?n.intValue()!=0:null; }
    private double value(List<Map<String,Object>> rows,int id,String key) {
        return rows.stream().filter(r->((Number)r.get("room_id")).intValue()==id).mapToDouble(r->((Number)r.get(key)).doubleValue()).findFirst().orElse(0);
    }
}
