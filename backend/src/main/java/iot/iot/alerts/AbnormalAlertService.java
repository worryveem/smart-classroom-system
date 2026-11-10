package iot.iot.alerts;

import com.fasterxml.jackson.databind.JsonNode;
import iot.iot.classroom.RoomIotAccess;
import iot.iot.exception.AdminOperationException;
import iot.iot.integration.nodered.NodeRedClient;
import iot.iot.integration.nodered.NodeRedProperties;
import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import static org.springframework.http.HttpStatus.*;

@Service
public class AbnormalAlertService {
    private final JdbcTemplate db;
    private final NodeRedClient nodeRed;
    private final NodeRedProperties properties;
    private final RoomIotAccess access;
    public AbnormalAlertService(JdbcTemplate db,NodeRedClient nodeRed,NodeRedProperties properties,RoomIotAccess access) {
        this.db=db; this.nodeRed=nodeRed; this.properties=properties; this.access=access;
    }
    public record Thresholds(double fanOn,double fanOff,double lightOn,double lightOff) {}
    public record Rule(String code,String title,String status,String message,String recommendation,Double value,
                       String unit,double threshold,Boolean deviceOn) {}
    public record Report(int roomId,String checkedAt,boolean sensorReady,boolean actuatorReady,boolean synchronizedReadings,
                         String sensorTimestamp,String actuatorTimestamp,Double temperature,Double light,
                         Boolean fanOn,Boolean lightOn,boolean estimatedLight,Thresholds thresholds,List<Rule> rules) {}
    public Report get(int roomId) {
        access.requireSensor(roomId); access.requireActuator(roomId);
        var row=db.queryForMap("SELECT fan_on,fan_off,light_on,light_off FROM room_automation WHERE room_id=?",roomId);
        var thresholds=new Thresholds(setting(row,"fan_on"),setting(row,"fan_off"),setting(row,"light_on"),setting(row,"light_off"));
        if(thresholds.fanOff()>=thresholds.fanOn() || thresholds.lightOn()>=thresholds.lightOff())
            throw new AdminOperationException(CONFLICT,"Ngưỡng cảnh báo chưa hợp lệ. Kiểm tra cấu hình Chế độ tự động.");
        JsonNode state;
        try { state=nodeRed.state(); }
        catch(iot.iot.exception.IntegrationException ex) {
            throw new AdminOperationException(SERVICE_UNAVAILABLE,"Chưa đọc được cảm biến và trạng thái thiết bị. Kiểm tra Node-RED rồi thử lại.");
        }
        var sensor=find(state,access.sensorId()); var actuator=find(state,properties.actuatorDeviceId());
        Instant now=Instant.now(); var sensorTime=time(sensor); var actuatorTime=time(actuator);
        boolean sensorReady=ready(sensor,sensorTime,now), actuatorReady=ready(actuator,actuatorTime,now);
        boolean synchronizedReadings=sensorReady && actuatorReady && Math.abs(Duration.between(sensorTime,actuatorTime).toMillis())<=30000;
        Double temperature=sensorReady?number(sensor,"temp",-40,125):null;
        Double light=sensorReady?number(sensor,"lux",0,100000):null;
        Boolean fan=actuatorReady?flag(actuator,"FAN"):null, lamp=actuatorReady?flag(actuator,"LIGHT"):null;
        var rules=evaluate(temperature,light,fan,lamp,synchronizedReadings,thresholds);
        boolean estimatedLight=sensor!=null && (sensor.path("lux_demo").asBoolean(false)
            || sensor.path("lux_estimated").asBoolean(false) || !sensor.path("lux_calibrated").asBoolean(false));
        return new Report(roomId,now.toString(),sensorReady,actuatorReady,synchronizedReadings,
            sensorTime==null?null:sensorTime.toString(),actuatorTime==null?null:actuatorTime.toString(),
            temperature,light,fan,lamp,estimatedLight,thresholds,rules);
    }
    public static List<Rule> evaluate(Double temp,Double lux,Boolean fan,Boolean light,boolean synchronizedReadings,Thresholds t) {
        return List.of(
            rule("HOT_FAN_OFF","Nóng nhưng quạt chưa bật",temp,"°C",fan,t.fanOn(),true,true,synchronizedReadings,
                "Nhiệt độ từ ngưỡng bật quạt trở lên nhưng quạt đang tắt.","Kiểm tra phòng và cân nhắc bật quạt."),
            rule("COOL_FAN_ON","Nhiệt độ thấp nhưng quạt vẫn bật",temp,"°C",fan,t.fanOff(),false,false,synchronizedReadings,
                "Nhiệt độ bằng hoặc thấp hơn ngưỡng tắt quạt nhưng quạt vẫn bật.","Cân nhắc tắt quạt nếu phòng đã đủ mát."),
            rule("DARK_LIGHT_OFF","Thiếu sáng nhưng đèn chưa bật",lux,"lux",light,t.lightOn(),false,true,synchronizedReadings,
                "Ánh sáng bằng hoặc thấp hơn ngưỡng bật đèn nhưng đèn đang tắt.","Nếu phòng đang được sử dụng, kiểm tra ánh sáng và cân nhắc bật đèn."),
            rule("BRIGHT_LIGHT_ON","Đủ sáng nhưng đèn vẫn bật",lux,"lux",light,t.lightOff(),true,false,synchronizedReadings,
                "Ánh sáng từ ngưỡng tắt đèn trở lên nhưng đèn vẫn bật.","Cân nhắc tắt đèn nếu ánh sáng thực tế đã đủ.")
        );
    }
    private static Rule rule(String code,String title,Double value,String unit,Boolean on,double threshold,
            boolean upper,boolean expectedOn,boolean synchronizedReadings,String message,String recommendation) {
        boolean known=synchronizedReadings && value!=null && Double.isFinite(value) && on!=null;
        boolean exceeded=known && (upper?value>=threshold:value<=threshold);
        boolean alert=exceeded && on!=expectedOn;
        return new Rule(code,title,known?(alert?"ALERT":"NORMAL"):"UNKNOWN",
            !known?"Chưa đủ số đo và trạng thái thiết bị mới để đánh giá.":alert?message:"Không có dấu hiệu bất thường theo quy tắc này.",
            alert?recommendation:"",value,unit,threshold,on);
    }
    private static JsonNode find(JsonNode root,String id) {
        if(root.path("devices").isArray()) for(var item:root.path("devices")) if(id.equals(item.path("device_id").asText())) return item;
        var keyed=root.path(id);
        if(keyed.isObject() && (!keyed.has("device_id") || id.equals(keyed.path("device_id").asText()))) return keyed;
        return id.equals(root.path("device_id").asText())?root:null;
    }
    private static Instant time(JsonNode node) {
        try { return node==null?null:Instant.parse(node.path("timestamp").asText()); }
        catch(DateTimeException ex) { return null; }
    }
    private static boolean ready(JsonNode node,Instant time,Instant now) {
        return node!=null && node.path("connected").isBoolean() && node.path("connected").booleanValue()
            && time!=null && !time.isBefore(now.minusSeconds(60)) && !time.isAfter(now.plusSeconds(5));
    }
    private static Double number(JsonNode node,String key,double min,double max) {
        var n=node.path(key);
        return n.isNumber() && Double.isFinite(n.doubleValue()) && n.doubleValue()>=min && n.doubleValue()<=max?n.doubleValue():null;
    }
    private static Boolean flag(JsonNode node,String key) { return node.path(key).isBoolean()?node.path(key).booleanValue():null; }
    private static double setting(Map<String,Object> row,String key) {
        if(!(row.get(key) instanceof Number n) || !Double.isFinite(n.doubleValue()))
            throw new AdminOperationException(CONFLICT,"Thiếu ngưỡng cảnh báo hợp lệ.");
        return ((Number)row.get(key)).doubleValue();
    }
}
