package iot.iot.ai;

import iot.iot.classroom.ClassroomService;
import iot.iot.classroom.RoomIotAccess;
import iot.iot.dto.*;
import iot.iot.dto.request.ControlRequest;
import iot.iot.entity.UserRole;
import iot.iot.exception.AdminOperationException;
import iot.iot.repository.UserRepository;
import iot.iot.security.user.CustomUserDetails;
import iot.iot.service.ControlService;
import jakarta.validation.constraints.*;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import static org.springframework.http.HttpStatus.*;

@Service
public class AutomationService {
    private final JdbcTemplate db;
    private final ClassroomService classroom;
    private final RoomIotAccess access;
    private final UserRepository users;
    private final ControlService control;
    public AutomationService(JdbcTemplate db, ClassroomService classroom, RoomIotAccess access,
            UserRepository users, ControlService control) {
        this.db=db; this.classroom=classroom; this.access=access; this.users=users; this.control=control;
    }
    public record Settings(@NotNull Boolean enabled,
        @NotNull @DecimalMin("10") @DecimalMax("50") Double fanOn,
        @NotNull @DecimalMin("5") @DecimalMax("45") Double fanOff,
        @NotNull @DecimalMin("0") @DecimalMax("100000") Double lightOn,
        @NotNull @DecimalMin("0") @DecimalMax("100000") Double lightOff,
        @Min(60) @Max(3600) int emptySeconds) {}

    // Named lock serializes settings, manual commands and ticks across backend instances.
    // No database transaction is held while waiting for Node-RED HTTP.
    public <T> T exclusive(Supplier<T> work) {
        return db.execute((ConnectionCallback<T>) connection -> {
            String key;
            try (var statement=connection.createStatement(); var rows=statement.executeQuery("SELECT SHA2(CONCAT(DATABASE(), ':automation:101'),256)")) {
                rows.next(); key=rows.getString(1);
            }
            try (var statement=connection.prepareStatement("SELECT GET_LOCK(?,0)")) {
                statement.setString(1,key);
                try (var rows=statement.executeQuery()) {
                    rows.next();
                    if(rows.getInt(1)!=1) throw new AdminOperationException(CONFLICT,"Đang xử lý lệnh khác; vui lòng thử lại.");
                }
            }
            try { return work.get(); }
            finally {
                try(var statement=connection.prepareStatement("SELECT RELEASE_LOCK(?)")) {
                    statement.setString(1,key); statement.execute();
                }
            }
        });
    }
    private void staff(CustomUserDetails actor) {
        if(actor.getRole()!=UserRole.ADMIN && actor.getRole()!=UserRole.TEACHER) throw new AccessDeniedException("Forbidden");
    }
    private Map<String,Object> row() { return db.queryForMap("SELECT * FROM room_automation WHERE room_id=101"); }
    public Map<String,Object> get(CustomUserDetails actor) {
        staff(actor);
        var row=row(); var permission=classroom.permission(actor,101);
        row.put("enabled",flag(row.get("enabled")));
        row.put("canConfigure",Boolean.TRUE.equals(permission.get("allowed")));
        row.put("permissionReason",permission.get("reason"));
        return row;
    }
    public Map<String,Object> save(Settings input,CustomUserDetails actor) {
        staff(actor);
        if(input.fanOff()>=input.fanOn() || input.lightOn()>=input.lightOff()
                || !Double.isFinite(input.fanOn()) || !Double.isFinite(input.fanOff())
                || !Double.isFinite(input.lightOn()) || !Double.isFinite(input.lightOff()))
            throw new AdminOperationException(BAD_REQUEST,"Ngưỡng tắt quạt phải nhỏ hơn ngưỡng bật; ngưỡng bật đèn phải nhỏ hơn ngưỡng tắt.");
        return exclusive(() -> {
            if(!Boolean.TRUE.equals(classroom.permission(actor,101).get("allowed")))
                throw new AccessDeniedException("Bạn không có quyền điều khiển phòng 101 trong thời điểm này.");
            if(input.enabled()) { access.requireSensor(101); access.requireActuator(101); }
            db.update("UPDATE room_automation SET enabled=?,enabled_by=?,fan_on=?,fan_off=?,light_on=?,light_off=?,empty_seconds=?,fan_action=NULL,light_action=NULL,in_flight=FALSE,message=? WHERE room_id=101",
                input.enabled(),actor.getId(),input.fanOn(),input.fanOff(),input.lightOn(),input.lightOff(),input.emptySeconds(),
                input.enabled()?"Đã bật; đang chờ kiểm tra dữ liệu cảm biến":"Đã tắt tự động; giữ nguyên trạng thái thiết bị");
            return get(actor);
        });
    }
    public void requireManual() {
        if(flag(row().get("enabled")))
            throw new AdminOperationException(CONFLICT,"Hãy tắt chế độ tự động trước khi điều khiển thủ công.");
    }
    private static boolean flag(Object v) { return Boolean.TRUE.equals(v) || v instanceof Number n && n.intValue()==1; }
    private static double number(Map<String,Object> row,String key) { return ((Number)row.get(key)).doubleValue(); }
    private void stop(String message) {
        db.update("UPDATE room_automation SET enabled=FALSE,in_flight=FALSE,message=?,checked_at=? WHERE room_id=101",message,ClassroomService.now());
    }
    private void message(String message) { db.update("UPDATE room_automation SET message=?,checked_at=? WHERE room_id=101",message,ClassroomService.now()); }

    public void tick() { exclusive(() -> { evaluate(); return null; }); }
    private void evaluate() {
        var state=row(); if(!flag(state.get("enabled"))) return;
        if(flag(state.get("in_flight"))) { stop("Lệnh trước chưa xác nhận sau gián đoạn; kiểm tra thiết bị trước khi bật lại."); return; }
        try {
            var owner=state.get("enabled_by");
            var user=owner instanceof Number n?users.findById(n.longValue()).orElse(null):null;
            if(user==null || !Boolean.TRUE.equals(classroom.permission(new CustomUserDetails(user),101).get("allowed"))) {
                stop("Đã dừng: người bật chế độ không còn quyền điều khiển hoặc ca sử dụng đã kết thúc."); return;
            }
            access.requireSensor(101); access.requireActuator(101);
            var now=ClassroomService.now();
            var samples=db.queryForList("SELECT temp,lux,occupancy,`timestamp` FROM telemetry WHERE device_id=? ORDER BY `timestamp` DESC,id DESC LIMIT 1",access.sensorId());
            if(samples.isEmpty()) { stop("Đã dừng: chưa có dữ liệu cảm biến."); return; }
            var sample=samples.get(0); var measured=ClassroomService.time(sample.get("timestamp"));
            if(measured.isAfter(now) || Duration.between(measured,now).getSeconds()>60) { stop("Đã dừng: dữ liệu cảm biến cũ hoặc thời gian đo không hợp lệ."); return; }
            if(!(sample.get("temp") instanceof Number t) || !(sample.get("lux") instanceof Number l)
                    || !Double.isFinite(t.doubleValue()) || !Double.isFinite(l.doubleValue())
                    || t.doubleValue() < -40 || t.doubleValue()>125 || l.doubleValue()<0 || sample.get("occupancy")==null) {
                stop("Đã dừng: thiếu dữ liệu hoặc giá trị cảm biến không hợp lệ."); return;
            }
            boolean occupied=flag(sample.get("occupancy"));
            if(!occupied) {
                int seconds=((Number)state.get("empty_seconds")).intValue();
                var history=db.queryForList("SELECT occupancy,`timestamp` FROM telemetry WHERE device_id=? AND `timestamp`>=? AND `timestamp`<=? ORDER BY `timestamp`,id LIMIT 10001",
                    access.sensorId(),now.minusSeconds(seconds+60L),now);
                LocalDateTime start=null,previous=null;
                for(var row:history) {
                    var time=ClassroomService.time(row.get("timestamp"));
                    if(previous!=null && Duration.between(previous,time).getSeconds()>60) start=null;
                    if(row.get("occupancy")==null || flag(row.get("occupancy"))) start=null;
                    else if(start==null) start=time;
                    previous=time;
                }
                if(history.size()>10000 || start==null || previous==null || Duration.between(start,previous).getSeconds()<seconds) {
                    if(l.doubleValue()>=number(state,"light_off")) {
                        send(state,ControlTarget.LIGHT,ControlAction.OFF,measured);
                        message("Đủ sáng; đã xét tắt đèn theo ngưỡng. Chưa có chuyển động, vẫn chờ đủ thời gian trước khi tắt do phòng vắng.");
                        return;
                    }
                    message("Chưa có chuyển động; đang chờ đủ thời gian trước khi tắt thiết bị."); return;
                }
            }
            var fan=occupied?AutomationPolicy.decide(t.doubleValue(),number(state,"fan_on"),number(state,"fan_off"),true):ControlAction.OFF;
            var light=occupied?AutomationPolicy.decide(l.doubleValue(),number(state,"light_on"),number(state,"light_off"),false):ControlAction.OFF;
            send(state,ControlTarget.FAN,fan,measured);
            send(state,ControlTarget.LIGHT,light,measured);
            message("Đang tự động theo dõi phòng 101; chỉ gửi lệnh khi cần đổi trạng thái.");
        } catch(RuntimeException error) {
            stop("Đã dừng: kết nối, cấu hình hoặc kết quả lệnh chưa được xác nhận. Kiểm tra thiết bị trước khi bật lại.");
        }
    }
    private void send(Map<String,Object> state,ControlTarget target,ControlAction action,LocalDateTime measured) {
        if(action==null) return;
        String prefix=target==ControlTarget.FAN?"fan":"light";
        if(action.name().equals(state.get(prefix+"_action"))) return;
        var now=ClassroomService.now();
        if(measured.isAfter(now) || Duration.between(measured,now).getSeconds()>60)
            throw new IllegalStateException("Mẫu cảm biến không còn mới");
        var changed=state.get(prefix+"_changed_at");
        if(changed!=null && Duration.between(ClassroomService.time(changed),now).getSeconds()<60) return;
        var user=users.findById(((Number)state.get("enabled_by")).longValue()).orElseThrow();
        if(!Boolean.TRUE.equals(classroom.permission(new CustomUserDetails(user),101).get("allowed")))
            throw new AccessDeniedException("Quyền điều khiển đã kết thúc");
        access.requireActuator(101);
        db.update("UPDATE room_automation SET in_flight=TRUE WHERE room_id=101");
        var result=control.automatic(new ControlRequest(target,action));
        if(result.status()!=CommandStatus.SUCCESS || result.logStatus()!=CommandLogStatus.SAVED)
            throw new IllegalStateException("Lệnh chưa được xác nhận hoàn tất");
        // prefix is selected exclusively from the two constants above.
        db.update("UPDATE room_automation SET "+prefix+"_action=?,"+prefix+"_changed_at=?,in_flight=FALSE WHERE room_id=101",action.name(),now);
    }
}
