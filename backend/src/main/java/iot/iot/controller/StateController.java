package iot.iot.controller;

import com.fasterxml.jackson.databind.JsonNode;
import iot.iot.common.ApiResponse;
import iot.iot.service.StateService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;
import iot.iot.classroom.RoomIotAccess;

@RestController
public class StateController {
    private final StateService state;
    private final RoomIotAccess access;
    public StateController(StateService state,RoomIotAccess access) { this.state = state; this.access=access; }
    @GetMapping("/api/state")
    public ResponseEntity<ApiResponse<JsonNode>> getState(@RequestParam(defaultValue="101") int roomId) {
        access.requireSensor(roomId);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .body(ApiResponse.ok("Get current state successfully", state.getState()));
    }
}
