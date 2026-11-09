package iot.iot.classroom;

import iot.iot.common.ApiResponse;
import iot.iot.exception.AdminOperationException;
import iot.iot.security.user.CustomUserDetails;
import java.time.LocalDate;
import java.util.*;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;
import static org.springframework.http.HttpStatus.*;

@RestController
@RequestMapping("/api/teaching/bookings")
@PreAuthorize("hasAnyRole('ADMIN','TEACHER')")
@Transactional(readOnly=true)
public class TeachingHistoryController {
    private final JdbcTemplate db;
    public TeachingHistoryController(JdbcTemplate db) { this.db=db; }
    private Object ok(Object data) { return ResponseEntity.ok().header("Cache-Control","no-store").body(ApiResponse.ok("Thành công",data)); }
    @GetMapping public Object history(@AuthenticationPrincipal CustomUserDetails actor,
        @RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="10") int size,
        @RequestParam(defaultValue="ALL") String period,@RequestParam(required=false) String status,@RequestParam(required=false) Integer roomId,
        @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to) {
        if(page<0 || page>10000 || size<1 || size>50 || !List.of("ALL","PAST","UPCOMING").contains(period)
            || (status!=null && !List.of("PENDING","APPROVED","REJECTED","CANCELLED","EXPIRED").contains(status))
            || (roomId!=null && roomId<=0) || (from!=null && to!=null && to.isBefore(from))
            || (from!=null && (from.getYear()<1 || from.getYear()>9998)) || (to!=null && (to.getYear()<1 || to.getYear()>9998)))
            throw new AdminOperationException(BAD_REQUEST,"Bộ lọc lịch không hợp lệ");
        var args=new ArrayList<Object>(); args.add(actor.getId());
        String where=" WHERE b.owner_id=?";
        if(!period.equals("ALL")) { where+=period.equals("PAST")?" AND b.ends_at<=?":" AND b.ends_at>?"; args.add(ClassroomService.now()); }
        if(status!=null) { where+=" AND b.status=?"; args.add(status); }
        if(roomId!=null) { where+=" AND b.room_id=?"; args.add(roomId); }
        if(from!=null) { where+=" AND b.ends_at>?"; args.add(from.atStartOfDay()); }
        if(to!=null) { where+=" AND b.starts_at<?"; args.add(to.plusDays(1).atStartOfDay()); }
        long total=db.queryForObject("SELECT COUNT(*) FROM classroom_bookings b"+where,Long.class,args.toArray());
        args.add(size); args.add(page*size);
        String order=period.equals("UPCOMING")?"ASC":"DESC";
        var rows=db.queryForList("SELECT b.*,r.name AS room_name,r.floor_number,r.status AS room_status FROM classroom_bookings b JOIN classroom_rooms r ON r.id=b.room_id"+where+" ORDER BY b.starts_at "+order+",b.id "+order+" LIMIT ? OFFSET ?",args.toArray());
        return ok(Map.of("rows",rows,"page",page,"size",size,"totalElements",total,"totalPages",(total+size-1)/size));
    }
    @GetMapping("/{id}") public Object detail(@PathVariable long id,@AuthenticationPrincipal CustomUserDetails actor) {
        var rows=db.queryForList("SELECT b.*,r.name AS room_name,r.floor_number,r.status AS room_status FROM classroom_bookings b JOIN classroom_rooms r ON r.id=b.room_id WHERE b.id=? AND b.owner_id=?",id,actor.getId());
        if(rows.isEmpty()) throw new AdminOperationException(NOT_FOUND,"Không tìm thấy lịch của bạn");
        return ok(rows.get(0));
    }
}
