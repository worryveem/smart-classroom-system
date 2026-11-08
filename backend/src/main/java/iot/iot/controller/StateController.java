package iot.iot.controller;

import com.fasterxml.jackson.databind.JsonNode;
import iot.iot.common.ApiResponse;
import iot.iot.service.StateService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class StateController {
    private final StateService state;
    public StateController(StateService state) { this.state = state; }
    @GetMapping("/api/state")
    public ResponseEntity<ApiResponse<JsonNode>> getState() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .body(ApiResponse.ok("Get current state successfully", state.getState()));
    }
}
