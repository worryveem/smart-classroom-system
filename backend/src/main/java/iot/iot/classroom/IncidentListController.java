package iot.iot.classroom;

import iot.iot.common.ApiResponse;
import iot.iot.entity.UserRole;
import iot.iot.exception.AdminOperationException;
import iot.iot.security.user.CustomUserDetails;
import java.util.*;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import static org.springframework.http.HttpStatus.BAD_REQUEST;

@RestController
@RequestMapping("/api/incidents")
public class IncidentListController {
    private final JdbcTemplate db;
    public IncidentListController(JdbcTemplate db) { this.db=db; }

    @GetMapping
    @Transactional(readOnly=true)
    public Object list(@AuthenticationPrincipal CustomUserDetails actor,
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="10") int size,
            @RequestParam(required=false) Integer roomId, @RequestParam(required=false) String status) {
        if(page<0 || page>10000 || size<1 || size>50 || roomId!=null && roomId<=0
                || status!=null && !List.of("OPEN","IN_PROGRESS","RESOLVED").contains(status))
            throw new AdminOperationException(BAD_REQUEST,"Bộ lọc sự cố không hợp lệ");
        var where=new StringBuilder(" WHERE 1=1"); var args=new ArrayList<Object>();
        if(actor.getRole()!=UserRole.ADMIN) { where.append(" AND i.reporter_id=?"); args.add(actor.getId()); }
        if(roomId!=null) { where.append(" AND i.room_id=?"); args.add(roomId); }
        if(status!=null) { where.append(" AND i.status=?"); args.add(status); }
        long total=Objects.requireNonNull(db.queryForObject("SELECT COUNT(*) FROM classroom_incidents i"+where,Long.class,args.toArray()));
        args.add(size); args.add((long)page*size);
        var rows=db.queryForList("SELECT i.*,r.name AS room_name FROM classroom_incidents i JOIN classroom_rooms r ON r.id=i.room_id"+where+" ORDER BY i.created_at DESC,i.id DESC LIMIT ? OFFSET ?",args.toArray());
        return ResponseEntity.ok().header("Cache-Control","no-store").body(ApiResponse.ok("Danh sách sự cố",
            Map.of("rows",rows,"page",page,"size",size,"totalElements",total,"totalPages",(total+size-1)/size)));
    }
}
