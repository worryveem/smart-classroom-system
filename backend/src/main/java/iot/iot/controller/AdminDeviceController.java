package iot.iot.controller;

import iot.iot.common.ApiResponse;
import iot.iot.dto.request.*;
import iot.iot.dto.response.*;
import iot.iot.entity.DeviceType;
import iot.iot.exception.AdminOperationException;
import iot.iot.service.AdminDeviceService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/devices")
public class AdminDeviceController {
    private final AdminDeviceService service;
    public AdminDeviceController(AdminDeviceService service) { this.service = service; }

    @GetMapping
    public ResponseEntity<ApiResponse<HistoryPageResponse<DeviceResponse>>> list(
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) Integer roomId,
            @RequestParam(name = "room_id", required = false) Integer roomIdAlias,
            @RequestParam(required = false) DeviceType type,
            @RequestParam(required = false) String status) {
        if (roomId != null && roomIdAlias != null && !roomId.equals(roomIdAlias)) {
            throw new AdminOperationException(HttpStatus.BAD_REQUEST, "Conflicting room filters");
        }
        return response(200, "Success", service.list(page, size, roomId == null ? roomIdAlias : roomId, type, status));
    }
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<DeviceResponse>> get(@PathVariable String id) {
        return response(200, "Success", service.get(id));
    }
    @PostMapping
    public ResponseEntity<ApiResponse<DeviceResponse>> create(@Valid @RequestBody CreateDeviceRequest request) {
        return response(201, "Device created", service.create(request));
    }
    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<DeviceResponse>> update(@PathVariable String id,
            @Valid @RequestBody UpdateDeviceRequest request) {
        return response(200, "Device updated", service.update(id, request));
    }
    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable String id) {
        service.delete(id);
        return response(200, "Device deleted", null);
    }
    private static <T> ResponseEntity<ApiResponse<T>> response(int status, String message, T data) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store").body(ApiResponse.ok(message, data));
    }
}
