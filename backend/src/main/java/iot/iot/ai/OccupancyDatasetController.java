package iot.iot.ai;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import iot.iot.common.ApiResponse;
import iot.iot.exception.AdminOperationException;
import iot.iot.security.user.CustomUserDetails;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.*;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static org.springframework.http.HttpStatus.*;

@RestController
@RequestMapping("/api/ai/rooms/{roomId}/dataset")
@PreAuthorize("hasAnyRole('ADMIN','TEACHER')")
public class OccupancyDatasetController {
    private final JdbcTemplate db;
    private final ObjectMapper mapper;
    private final iot.iot.classroom.RoomIotAccess access;
    public OccupancyDatasetController(JdbcTemplate db,ObjectMapper mapper,iot.iot.classroom.RoomIotAccess access) {
        this.db=db; this.mapper=mapper; this.access=access;
    }
    public record Observation(@NotNull @Min(0) @Max(1000) Integer peopleCount) {
        @JsonAnySetter public void rejectUnknown(String key,Object value) { throw new IllegalArgumentException("Trường quan sát không hợp lệ"); }
    }
    @GetMapping public Object stats(@PathVariable int roomId,@AuthenticationPrincipal CustomUserDetails actor) {
        access.requireSensor(roomId);
        var rows=db.queryForList("SELECT o.history_id AS historyId,o.people_count AS peopleCount FROM ai_occupancy_observations o JOIN ai_suggestion_history h ON h.id=o.history_id WHERE h.user_id=? AND h.room_id=? ORDER BY o.history_id DESC",actor.getId(),roomId);
        return ResponseEntity.ok().header("Cache-Control","no-store").body(ApiResponse.ok("Dữ liệu huấn luyện của bạn",Map.of("observations",rows,"count",rows.size())));
    }
    @PutMapping("/{historyId}") public Object observe(@PathVariable int roomId,@PathVariable long historyId,
            @Valid @RequestBody Observation input,@AuthenticationPrincipal CustomUserDetails actor) {
        access.requireSensor(roomId);
        var rows=db.queryForList("SELECT result_json FROM ai_suggestion_history WHERE id=? AND user_id=? AND room_id=?",historyId,actor.getId(),roomId);
        if(rows.isEmpty()) throw new AdminOperationException(NOT_FOUND,"Không tìm thấy mẫu phân tích của bạn.");
        JsonNode sample=parse(rows.get(0).get("result_json").toString());
        // Chỉ gán nhãn mẫu mới: người dùng xác nhận hiện trạng ngay sau khi phân tích.
        Instant time;
        try { time=Instant.parse(sample.path("sampledAt").asText()); }
        catch(java.time.DateTimeException ex) { throw new AdminOperationException(CONFLICT,"Mẫu thiếu thời gian lấy dữ liệu hợp lệ."); }
        if(time.isBefore(Instant.now().minusSeconds(300)) || time.isAfter(Instant.now().plusSeconds(5)))
            throw new AdminOperationException(CONFLICT,"Mẫu đã quá 5 phút. Hãy phân tích lại rồi ghi số người đang có trong phòng.");
        if(!sample.path("input").path("ldr_adc").isIntegralNumber())
            throw new AdminOperationException(CONFLICT,"Mẫu thiếu ADC thô, không dùng để huấn luyện.");
        db.update("INSERT INTO ai_occupancy_observations(history_id,observer_id,people_count) VALUES (?,?,?) ON DUPLICATE KEY UPDATE people_count=?,observed_at=CURRENT_TIMESTAMP",historyId,actor.getId(),input.peopleCount(),input.peopleCount());
        return ResponseEntity.ok().header("Cache-Control","no-store").body(ApiResponse.ok("Đã lưu số người quan sát thực tế",Map.of("historyId",historyId,"peopleCount",input.peopleCount())));
    }
    @GetMapping("/export") public ResponseEntity<String> export(@PathVariable int roomId,@AuthenticationPrincipal CustomUserDetails actor) {
        access.requireSensor(roomId);
        var rows=db.queryForList("SELECT h.id,h.result_json,o.people_count FROM ai_occupancy_observations o JOIN ai_suggestion_history h ON h.id=o.history_id WHERE h.user_id=? AND h.room_id=? ORDER BY h.id LIMIT 10001",actor.getId(),roomId);
        if(rows.size()>10000) throw new AdminOperationException(CONFLICT,"Bộ dữ liệu vượt 10000 mẫu; cần xuất theo đợt.");
        var csv=new StringBuilder("sample_id,sensor_id,sampled_at,temp,ldr_adc,pir_active,people_count,label_source\n");
        for(var row:rows) {
            var sample=parse(row.get("result_json").toString()); var input=sample.path("input");
            csv.append(row.get("id")).append(',').append(quote(sample.path("sensorId").asText())).append(',')
                .append(quote(sample.path("sampledAt").asText())).append(',').append(input.path("temp").asDouble()).append(',')
                .append(input.path("ldr_adc").asInt()).append(',').append(input.path("motion").asBoolean()?1:0).append(',')
                .append(row.get("people_count")).append(",MANUAL\n");
        }
        return ResponseEntity.ok().header("Cache-Control","no-store")
            .header("Content-Disposition","attachment; filename=occupancy-adc-room-"+roomId+".csv")
            .header("Content-Type","text/csv; charset=UTF-8").body(csv.toString());
    }
    private String quote(String text) { return "\""+text.replace("\"","\"\"")+"\""; }
    private JsonNode parse(String text) {
        try { return mapper.readTree(text); }
        catch(com.fasterxml.jackson.core.JsonProcessingException ex) { throw new IllegalStateException(ex); }
    }
}
