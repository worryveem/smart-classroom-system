package iot.iot.classroom;

import iot.iot.common.ApiResponse;
import iot.iot.security.user.CustomUserDetails;
import jakarta.validation.Valid;
import java.time.LocalDateTime;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static iot.iot.classroom.ClassroomDtos.*;

@RestController
@RequestMapping("/api/classroom")
public class ClassroomController {
    private final ClassroomService service;
    public ClassroomController(ClassroomService service) { this.service=service; }
    private <T> ResponseEntity<ApiResponse<T>> ok(T data) {
        return ResponseEntity.ok().header("Cache-Control","no-store").body(ApiResponse.ok("Thành công",data));
    }
    @GetMapping("/settings") public Object settings() { return ok(service.settings()); }
    @GetMapping("/workspace") public Object workspace(@AuthenticationPrincipal CustomUserDetails actor) { return ok(service.workspace(actor)); }
    @PutMapping("/settings") public Object settings(@Valid @RequestBody Settings input,@AuthenticationPrincipal CustomUserDetails actor) { return ok(service.updateSettings(input,actor)); }
    @GetMapping("/permission") public Object permission(@AuthenticationPrincipal CustomUserDetails actor,@RequestParam(defaultValue="101") int roomId) { return ok(service.permission(actor,roomId)); }
    @GetMapping("/bookings") public Object bookings(
        @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
        @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
        @RequestParam(defaultValue="101") int roomId) { return ok(service.bookings(from,to,roomId)); }
    @PostMapping("/bookings") public Object createBooking(@Valid @RequestBody BookingInput input,@AuthenticationPrincipal CustomUserDetails actor) { return ok(service.createBooking(input,actor)); }
    @PutMapping("/bookings/{id}") public Object editBooking(@PathVariable long id,@Valid @RequestBody BookingInput input,@AuthenticationPrincipal CustomUserDetails actor) { return ok(service.editBooking(id,input,actor)); }
    @PatchMapping("/bookings/{id}") public Object decision(@PathVariable long id,@Valid @RequestBody BookingDecision input,@AuthenticationPrincipal CustomUserDetails actor) { return ok(service.decide(id,input,actor)); }
    @GetMapping("/bookings/{id}/report") public Object report(@PathVariable long id,@AuthenticationPrincipal CustomUserDetails actor) { return ok(service.report(id,actor)); }
    @GetMapping("/alerts") public Object alerts(@RequestParam(defaultValue="101") int roomId) { return ok(service.alerts(roomId)); }
    @PostMapping("/alerts/{id}/acknowledge") public Object acknowledge(@PathVariable long id,@AuthenticationPrincipal CustomUserDetails actor) { service.acknowledge(id,actor); return ok(null); }
    @GetMapping("/incidents") public Object incidents(@AuthenticationPrincipal CustomUserDetails actor,@RequestParam(defaultValue="101") int roomId) { return ok(service.incidents(actor,roomId)); }
    @PostMapping("/incidents") public Object createIncident(@Valid @RequestBody IncidentInput input,@AuthenticationPrincipal CustomUserDetails actor) { return ok(service.createIncident(input,actor)); }
    @PatchMapping("/incidents/{id}") public Object updateIncident(@PathVariable long id,@Valid @RequestBody IncidentUpdate input,@AuthenticationPrincipal CustomUserDetails actor) { return ok(service.updateIncident(id,input,actor)); }
    @GetMapping("/incidents/{id}/events") public Object events(@PathVariable long id,@AuthenticationPrincipal CustomUserDetails actor) { return ok(service.incidentEvents(id,actor)); }
    @GetMapping("/attempts") public Object attempts(@AuthenticationPrincipal CustomUserDetails actor,@RequestParam(defaultValue="101") int roomId) { return ok(service.attempts(actor,roomId)); }
}
