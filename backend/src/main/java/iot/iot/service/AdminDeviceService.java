package iot.iot.service;

import iot.iot.dto.request.*;
import iot.iot.dto.response.*;
import iot.iot.entity.*;
import iot.iot.exception.AdminOperationException;
import iot.iot.repository.DeviceRepository;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static org.springframework.http.HttpStatus.*;

@Service
@PreAuthorize("hasRole('ADMIN')")
@Transactional(readOnly = true)
public class AdminDeviceService {
    private final DeviceRepository devices;
    private final iot.iot.repository.DeviceInsertRepository inserts;
    private final org.springframework.jdbc.core.JdbcTemplate db;
    private final iot.iot.integration.nodered.NodeRedProperties nodeRed;
    public AdminDeviceService(DeviceRepository devices, iot.iot.repository.DeviceInsertRepository inserts,org.springframework.jdbc.core.JdbcTemplate db,iot.iot.integration.nodered.NodeRedProperties nodeRed) {
        this.devices = devices;
        this.inserts = inserts;
        this.db=db; this.nodeRed=nodeRed;
    }
    private void requireUnassigned(String id) {
        db.queryForObject("SELECT id FROM classroom_settings WHERE id=1 FOR UPDATE",Integer.class);
        if(id.equals(nodeRed.actuatorDeviceId()) || db.queryForObject("SELECT COUNT(*) FROM classroom_settings WHERE sensor_device_id=?",Integer.class,id)>0)
            throw new AdminOperationException(CONFLICT,"Thiết bị đang được cấu hình cho luồng IoT. Đổi cấu hình tích hợp trước khi xóa, đổi loại hoặc chuyển phòng.");
        if(db.queryForObject("SELECT COUNT(*) FROM classroom_booking_context c JOIN classroom_bookings b ON b.id=c.booking_id WHERE c.sensor_device_id=? AND b.status='APPROVED' AND b.ends_at>?",Integer.class,id,iot.iot.classroom.ClassroomService.now())>0)
            throw new AdminOperationException(CONFLICT,"Thiết bị đang gắn với ca đã duyệt chưa kết thúc. Xử lý lịch trước khi chuyển phòng hoặc xóa thiết bị.");
    }

    public HistoryPageResponse<DeviceResponse> list(int page, int size, Integer roomId, DeviceType type, String status) {
        if (roomId != null && roomId <= 0) throw new AdminOperationException(BAD_REQUEST, "Invalid roomId");
        DeviceStatus selected = null;
        if (status != null) {
            try { selected = DeviceStatusInput.parse(status).entityValue(); }
            catch (IllegalArgumentException error) { throw new AdminOperationException(BAD_REQUEST, "Invalid device status"); }
        }
        final DeviceStatus filterStatus = selected;
        var pageable = AdminPagination.of(page, size, "deviceId");
        return HistoryPageResponse.from(devices.findAll((root, query, cb) -> {
            var predicates = new java.util.ArrayList<jakarta.persistence.criteria.Predicate>();
            if (roomId != null) predicates.add(cb.equal(root.get("roomId"), roomId));
            if (type != null) predicates.add(cb.equal(root.get("type"), type));
            if (filterStatus != null) predicates.add(cb.equal(root.get("status"), filterStatus));
            return cb.and(predicates.toArray(jakarta.persistence.criteria.Predicate[]::new));
        }, pageable).map(DeviceResponse::from));
    }

    private Device require(String id) {
        return devices.findById(id).orElseThrow(() -> new AdminOperationException(NOT_FOUND, "Device not found"));
    }
    public DeviceResponse get(String id) { return DeviceResponse.from(require(id)); }

    @Transactional
    public DeviceResponse create(CreateDeviceRequest request) {
        if (devices.existsByDeviceId(request.deviceId())) throw new AdminOperationException(CONFLICT, "Device already exists");
        Device device = new Device();
        device.setDeviceId(request.deviceId());
        device.setRoomId(request.roomId());
        device.setType(request.type());
        device.setMacAddress(request.macAddress());
        device.setStatus(request.status().entityValue());
        // Assigned identifiers must be persisted, not merged: never overwrite a concurrent insert.
        inserts.insert(device);
        return DeviceResponse.from(device);
    }
    @Transactional
    public DeviceResponse update(String id, UpdateDeviceRequest request) {
        Device device = require(id);
        if(!device.getRoomId().equals(request.roomId()) || device.getType()!=request.type()) requireUnassigned(id);
        device.setRoomId(request.roomId());
        device.setType(request.type());
        device.setMacAddress(request.macAddress());
        device.setStatus(request.status().entityValue());
        return DeviceResponse.from(devices.saveAndFlush(device));
    }

    @Transactional
    public void delete(String id) {
        Device device = require(id);
        requireUnassigned(id);
        devices.delete(device);
        // MySQL RESTRICT is authoritative, including references inserted concurrently by Node-RED.
        devices.flush();
    }
}
