package iot.iot.classroom;

import iot.iot.common.ApiResponse;
import iot.iot.dto.CommandStatus;
import iot.iot.dto.request.ControlRequest;
import iot.iot.security.user.CustomUserDetails;
import iot.iot.service.StateService;
import iot.iot.service.TelemetryService;
import jakarta.validation.Valid;
import java.time.LocalDateTime;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/iot/rooms/{roomId}")
public class RoomIotController {
    private final RoomIotAccess access;
    private final StateService state;
    private final TelemetryService telemetry;
    private final ClassroomControlService control;
    public RoomIotController(RoomIotAccess access,StateService state,TelemetryService telemetry,ClassroomControlService control) {
        this.access=access; this.state=state; this.telemetry=telemetry; this.control=control;
    }
    private Object ok(Object data) { return ResponseEntity.ok().header("Cache-Control","no-store").body(ApiResponse.ok("Thành công",data)); }
    @GetMapping public Object room(@PathVariable int roomId) { return ok(access.metadata(roomId)); }
    @GetMapping("/state") public Object state(@PathVariable int roomId) { access.requireSensor(roomId); return ok(state.getState()); }
    @GetMapping("/telemetry") public Object telemetry(@PathVariable int roomId,
        @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
        @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
        @RequestParam(defaultValue="100") int limit) {
        access.requireSensor(roomId); return ok(telemetry.history(access.sensorId(),from,to,limit));
    }
    @PostMapping("/control") public Object control(@PathVariable int roomId,@Valid @RequestBody ControlRequest input,@AuthenticationPrincipal CustomUserDetails actor) {
        var result=control.execute(input,actor,roomId);
        return ResponseEntity.status(result.status()==CommandStatus.SUCCESS?200:202).header("Cache-Control","no-store").body(ApiResponse.ok("Kết quả điều khiển",result));
    }
}
