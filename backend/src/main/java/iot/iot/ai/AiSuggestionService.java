package iot.iot.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import iot.iot.classroom.RoomIotAccess;
import iot.iot.exception.AdminOperationException;
import iot.iot.integration.nodered.NodeRedClient;
import iot.iot.security.user.CustomUserDetails;
import jakarta.validation.constraints.*;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import static org.springframework.http.HttpStatus.*;

@Service
public class AiSuggestionService {
    private final AiClient ai;
    private final NodeRedClient nodeRed;
    private final RoomIotAccess access;
    private final JdbcTemplate db;
    private final ObjectMapper mapper;
    public AiSuggestionService(AiClient ai, NodeRedClient nodeRed, RoomIotAccess access, JdbcTemplate db, ObjectMapper mapper) {
        this.ai=ai; this.nodeRed=nodeRed; this.access=access; this.db=db; this.mapper=mapper;
    }
    public record AnalyzeInput(@NotNull @Min(1) @Max(4094) Integer threshold, @NotNull Boolean highIsBright) {
        @com.fasterxml.jackson.annotation.JsonAnySetter
        public void rejectUnknown(String name,Object value) { throw new IllegalArgumentException("Trường phân tích AI không hợp lệ"); }
    }
    public enum SampleLabel { EMPTY, LOW, CROWDED }
    public record DemoInput(@NotNull SampleLabel sampleLabel) {
        @com.fasterxml.jackson.annotation.JsonAnySetter
        public void rejectUnknown(String key,Object value) { throw new IllegalArgumentException("Trường mẫu hiện diện không hợp lệ"); }
    }
    public JsonNode occupancyDemo(int roomId,DemoInput input) {
        access.requireSensor(roomId);
        return ai.occupancyDemo(input.sampleLabel().name());
    }
    public Map<String,Object> status(int roomId) {
        access.requireSensor(roomId);
        var result = new LinkedHashMap<String,Object>();
        result.put("roomId",roomId);
        result.put("occupancyMode","CURRENT_SENSOR");
        result.put("occupancyDemoReady",false);
        result.put("occupancyLiveReady",false);
        result.put("occupancyNotice","Cần đối chiếu cách xử lý ánh sáng và dữ liệu huấn luyện trước khi phân tích mức hiện diện từ cảm biến phòng.");
        try {
            var health=ai.health(); result.put("service",health);
            result.put("occupancyDemoReady",health.path("models").path("occupancy").asBoolean(false));
            boolean ready=health.path("models").path("occupancy").asBoolean(false);
            result.put("occupancyLiveReady",ready);
            result.put("occupancyNotice","Phân tích model gốc từ nhiệt độ, ánh sáng quy đổi, PIR và giờ hiện tại; kết quả là ước tính, chưa được kiểm chứng tại phòng.");
        }
        catch (AdminOperationException ex) { result.put("service",Map.of("status","offline","models",Map.of("anomaly",false,"occupancy",false))); }
        return result;
    }
    private record LiveSnapshot(String sensorId,JsonNode sensor,Instant sampledAt) {}
    private LiveSnapshot snapshot(int roomId) {
        access.requireSensor(roomId);
        String sensorId = access.sensorId();
        JsonNode raw;
        try { raw=nodeRed.state(); }
        catch (iot.iot.exception.IntegrationException ex) {
            throw new AdminOperationException(SERVICE_UNAVAILABLE,"Chưa đọc được cảm biến từ Node-RED. Kiểm tra dịch vụ và kết nối rồi thử lại.");
        }
        JsonNode sensor = null;
        if (raw.path("devices").isArray()) {
            for (var item : raw.path("devices")) if (sensorId.equals(item.path("device_id").asText())) sensor=item;
        } else if (raw.path(sensorId).isObject()) {
            var item=raw.path(sensorId);
            if (!item.has("device_id") || sensorId.equals(item.path("device_id").asText())) sensor=item;
        } else if (sensorId.equals(raw.path("device_id").asText())) sensor=raw;
        if (sensor == null || !sensor.path("connected").isBoolean() || !sensor.path("connected").booleanValue())
            throw invalid("Cảm biến phòng đang mất kết nối; chưa thể phân tích AI.");
        Instant sampledAt;
        try { sampledAt=Instant.parse(sensor.path("timestamp").asText()); }
        catch (DateTimeException ex) { throw invalid("Mẫu cảm biến thiếu thời gian hợp lệ."); }
        Instant now=Instant.now();
        if (sampledAt.isBefore(now.minusSeconds(60)) || sampledAt.isAfter(now.plusSeconds(5)))
            throw invalid("Mẫu cảm biến đã quá 60 giây hoặc có thời gian không hợp lệ; hãy lấy mẫu mới.");
        return new LiveSnapshot(sensorId,sensor,sampledAt);
    }
    public Map<String,Object> occupancyLive(int roomId) {
        var snapshot=snapshot(roomId);
        return Map.of("roomId",roomId,"sensorId",snapshot.sensorId(),"sampledAt",snapshot.sampledAt().toString(),
            "analyzedAt",Instant.now().toString(),"prediction",predictOccupancy(snapshot));
    }
    private JsonNode predictOccupancy(LiveSnapshot snapshot) {
        var sensor=snapshot.sensor();
        double temp=number(sensor,"temp",-40,125);
        var lux=sensor.path("lux");
        if(!lux.isNumber() || !Double.isFinite(lux.doubleValue()) || lux.doubleValue()<0)
            throw invalid("Thiếu giá trị ánh sáng hợp lệ; chưa thể phân tích mức hiện diện.");
        var motion=sensor.path("occupancy");
        if(!motion.isBoolean()) throw invalid("PIR chưa sẵn sàng; chưa thể phân tích mức hiện diện.");
        String source=sensor.path("lux_demo").asBoolean(false)?"LDR_DEMO_LUX":
            sensor.path("lux_estimated").asBoolean(false)?"ESTIMATED_LUX":
            sensor.path("lux_calibrated").asBoolean(false)?"CALIBRATED_LUX":"UNVERIFIED_LUX";
        return ai.occupancyLive(Map.of("temperatures",List.of(temp),"lights",List.of(lux.doubleValue()),
            "pir_values",List.of(motion.booleanValue()?1:0),"hour",snapshot.sampledAt().atZone(ZoneId.of("Asia/Ho_Chi_Minh")).getHour(),"light_source",source));
    }
    public Map<String,Object> analyze(int roomId, AnalyzeInput input, CustomUserDetails actor) {
        var snapshot=snapshot(roomId);
        var sensor=snapshot.sensor(); var sampledAt=snapshot.sampledAt(); String sensorId=snapshot.sensorId();
        double temp=number(sensor,"temp",-40,125), humid=number(sensor,"humid",0,100);
        var adc=sensor.path("ldr_adc");
        if (!adc.isIntegralNumber() || !adc.canConvertToInt() || adc.intValue()<0 || adc.intValue()>4095)
            throw invalid("Thiếu ADC ánh sáng hợp lệ (0–4095); AI không dùng lux demo thay thế.");
        var motion=sensor.path("occupancy");
        if (!motion.isBoolean()) throw invalid("PIR chưa sẵn sàng hoặc thiếu dữ liệu chuyển động.");
        var payload=Map.of("temp",temp,"humidity",humid,"motion",motion.booleanValue(),"ldr_adc",adc.intValue(),
            "threshold",input.threshold(),"high_is_bright",input.highIsBright());
        JsonNode prediction=ai.anomaly(payload);
        var result=new LinkedHashMap<String,Object>();
        result.put("roomId",roomId); result.put("sensorId",sensorId);
        result.put("sampledAt",sampledAt.toString()); result.put("analyzedAt",Instant.now().toString());
        result.put("input",payload); result.put("anomaly",prediction);
        try {
            var occupancy=predictOccupancy(snapshot);
            if(occupancy!=null) result.put("occupancy",occupancy);
        } catch(AdminOperationException ex) {
            result.put("occupancy",Map.of("status","UNAVAILABLE","notice",ex.getMessage()));
        }
        String json;
        try { json=mapper.writeValueAsString(result); }
        catch (com.fasterxml.jackson.core.JsonProcessingException ex) { throw new IllegalStateException(ex); }
        db.update("INSERT INTO ai_suggestion_history(user_id,room_id,result_json) VALUES (?,?,?)",actor.getId(),roomId,json);
        return result;
    }
    public List<Map<String,Object>> history(int roomId, CustomUserDetails actor) {
        access.requireSensor(roomId);
        return db.query("SELECT id,result_json,created_at FROM ai_suggestion_history WHERE user_id=? AND room_id=? ORDER BY id DESC LIMIT 20",
            (rs,index) -> {
                var row=new LinkedHashMap<String,Object>();
                row.put("id",rs.getLong("id")); row.put("createdAt",rs.getTimestamp("created_at").toLocalDateTime().toString());
                try { row.put("result",mapper.readTree(rs.getString("result_json"))); }
                catch (com.fasterxml.jackson.core.JsonProcessingException ex) { throw new IllegalStateException(ex); }
                return (Map<String,Object>) row;
            },actor.getId(),roomId);
    }
    private double number(JsonNode node,String field,double min,double max) {
        var value=node.path(field);
        if (!value.isNumber() || !Double.isFinite(value.doubleValue()) || value.doubleValue()<min || value.doubleValue()>max)
            throw invalid("Thiếu hoặc sai dữ liệu nhiệt độ/độ ẩm; hãy kiểm tra DHT trước khi phân tích.");
        return value.doubleValue();
    }
    private AdminOperationException invalid(String message) { return new AdminOperationException(CONFLICT,message); }
}
