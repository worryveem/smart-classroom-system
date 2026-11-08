package iot.iot.classroom;

import iot.iot.common.ApiResponse;
import iot.iot.exception.AdminOperationException;
import iot.iot.security.user.CustomUserDetails;
import jakarta.validation.Valid;
import java.time.LocalDateTime;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import static iot.iot.classroom.ClassroomDtos.*;

@RestController
@RequestMapping("/api/building")
public class BuildingController {
    private final BuildingService service;
    public BuildingController(BuildingService service) { this.service=service; }
    private Object ok(Object data) { return ResponseEntity.ok().header("Cache-Control","no-store").body(ApiResponse.ok("Thành công",data)); }
    @GetMapping("/rooms") public Object rooms() { return ok(service.rooms()); }
    @GetMapping("/overview") public Object overview(
        @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
        @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE_TIME) LocalDateTime to) { return ok(service.overview(from,to)); }
    @PostMapping("/rooms") public Object create(@Valid @RequestBody RoomInput input,@AuthenticationPrincipal CustomUserDetails actor) { return ok(service.save(input,actor,true)); }
    @PutMapping("/rooms/{id}") public Object update(@PathVariable int id,@Valid @RequestBody RoomInput input,@AuthenticationPrincipal CustomUserDetails actor) {
        if(id!=input.roomId()) throw new AdminOperationException(HttpStatus.BAD_REQUEST,"Không đổi số phòng đã tạo; hãy tạm ngưng phòng cũ và tạo phòng mới");
        return ok(service.save(input,actor,false));
    }
    @GetMapping("/rooms/{id}/events") public Object events(@PathVariable int id,@AuthenticationPrincipal CustomUserDetails actor) { return ok(service.events(id,actor)); }
}
