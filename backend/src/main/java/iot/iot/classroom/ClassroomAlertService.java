package iot.iot.classroom;

import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ClassroomAlertService {
    private final JdbcTemplate db;
    public ClassroomAlertService(JdbcTemplate db) { this.db=db; }

    public record Sample(LocalDateTime time, Double temperature, Double lux, boolean occupied) {}

    // A threshold must persist across real samples; a missing measurement breaks continuity.
    public static boolean sustained(List<Sample> samples, LocalDateTime now, int seconds,
            int maximumGap, java.util.function.Predicate<Sample> predicate) {
        LocalDateTime start=null, previous=null;
        for(var sample:samples) {
            if(sample.time().isAfter(now)) continue;
            if(previous!=null && Duration.between(previous,sample.time()).getSeconds()>maximumGap) start=null;
            if(!predicate.test(sample)) start=null;
            else if(start==null) start=sample.time();
            previous=sample.time();
        }
        return start!=null && previous!=null && Duration.between(previous,now).getSeconds()<=maximumGap
            && Duration.between(start,previous).getSeconds()>=seconds;
    }

    @Transactional
    public void evaluate() {
        // Serialize with settings updates and other scheduler instances.
        db.queryForObject("SELECT id FROM classroom_settings WHERE id=1 FOR UPDATE",Integer.class);
        var settings=db.queryForMap("SELECT * FROM classroom_settings WHERE id=1");
        String sensor=(String)settings.get("sensor_device_id");
        int offline=((Number)settings.get("offline_seconds")).intValue();
        int duration=((Number)settings.get("sustained_seconds")).intValue();
        double temperature=((Number)settings.get("temperature_limit")).doubleValue();
        double lux=((Number)settings.get("minimum_lux")).doubleValue();
        var now=ClassroomService.now();
        var rows=db.queryForList("SELECT temp,lux,occupancy,`timestamp` FROM telemetry WHERE device_id IN (SELECT device_id FROM devices WHERE room_id=101 AND type='SENSOR') AND device_id=? AND `timestamp`<=? ORDER BY `timestamp` DESC,id DESC LIMIT 1",sensor,now);
        boolean disconnected=rows.isEmpty() || Duration.between(ClassroomService.time(rows.get(0).get("timestamp")),now).getSeconds()>offline;
        sync("SENSOR_OFFLINE",disconnected,"Chưa nhận dữ liệu cảm biến "+sensor+" trong "+offline+" giây");
        if(disconnected) return; // Missing telemetry is not evidence that environmental conditions recovered.
        var samples=db.query("SELECT temp,lux,occupancy,`timestamp` FROM telemetry WHERE device_id=? AND `timestamp` BETWEEN ? AND ? ORDER BY `timestamp` DESC,id DESC LIMIT 10001",
            (rs,index)->new Sample(rs.getTimestamp("timestamp").toLocalDateTime(),(Double)rs.getObject("temp"),(Double)rs.getObject("lux"),rs.getBoolean("occupancy")),
            sensor,now.minusSeconds((long)duration+offline),now);
        if(samples.size()>10000) return; // Never claim sustained conditions after truncating the observation window.
        Collections.reverse(samples);
        sync("HIGH_TEMPERATURE",sustained(samples,now,duration,offline,s->s.temperature()!=null && s.temperature()>temperature),
            "Nhiệt độ vượt "+temperature+" °C kéo dài qua các mẫu đo ít nhất "+duration+" giây");
        sync("LOW_LIGHT",sustained(samples,now,duration,offline,s->s.occupied() && s.lux()!=null && s.lux()<lux),
            "Ánh sáng dưới "+lux+" lux khi có người, kéo dài qua các mẫu đo ít nhất "+duration+" giây");
    }
    private void sync(String kind,boolean active,String message) {
        Long count=db.queryForObject("SELECT COUNT(*) FROM classroom_alerts WHERE kind=? AND ended_at IS NULL",Long.class,kind);
        if(active && count==0) db.update("INSERT INTO classroom_alerts(kind,message) VALUES (?,?)",kind,message);
        else if(!active && count>0) db.update("UPDATE classroom_alerts SET ended_at=CURRENT_TIMESTAMP WHERE kind=? AND ended_at IS NULL",kind);
    }
}
