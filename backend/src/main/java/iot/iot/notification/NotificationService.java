package iot.iot.notification;

import iot.iot.classroom.ClassroomService;
import iot.iot.exception.AdminOperationException;
import iot.iot.security.user.CustomUserDetails;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
import static org.springframework.http.HttpStatus.*;

@Service
@Transactional(readOnly=true)
public class NotificationService {
    private final JdbcTemplate db;
    public NotificationService(JdbcTemplate db) { this.db=db; }
    private String shorten(String message) { return message.codePointCount(0,message.length())<=1000?message:message.substring(0,message.offsetByCodePoints(0,1000)); }
    @Transactional(propagation=Propagation.MANDATORY)
    public void send(long recipient,String kind,String title,String message,String target) {
        db.update("INSERT INTO app_notifications(recipient_id,kind,title,message,target_path,created_at) SELECT id,?,?,?,?,? FROM users WHERE id=?",
            kind,title,shorten(message),target,ClassroomService.now(),recipient);
    }
    @Transactional(propagation=Propagation.MANDATORY)
    public void administrators(String kind,String title,String message,String target) {
        db.update("INSERT INTO app_notifications(recipient_id,kind,title,message,target_path,created_at) SELECT id,?,?,?,?,? FROM users WHERE role='ADMIN'",
            kind,title,shorten(message),target,ClassroomService.now());
    }
    public long unread(CustomUserDetails actor) { return db.queryForObject("SELECT COUNT(*) FROM app_notifications WHERE recipient_id=? AND read_at IS NULL",Long.class,actor.getId()); }
    public Map<String,Object> list(CustomUserDetails actor,int page,int size,boolean unreadOnly) {
        if(page<0 || page>10000 || size<1 || size>50) throw new AdminOperationException(BAD_REQUEST,"Phân trang không hợp lệ");
        String where=" WHERE recipient_id=?"+(unreadOnly?" AND read_at IS NULL":"");
        long total=db.queryForObject("SELECT COUNT(*) FROM app_notifications"+where,Long.class,actor.getId());
        var rows=db.queryForList("SELECT id,kind,title,message,target_path,created_at,read_at FROM app_notifications"+where+" ORDER BY id DESC LIMIT ? OFFSET ?",actor.getId(),size,page*size);
        long latest=db.queryForObject("SELECT COALESCE(MAX(id),0) FROM app_notifications WHERE recipient_id=?",Long.class,actor.getId());
        return Map.of("rows",rows,"page",page,"size",size,"totalElements",total,"totalPages",(total+size-1)/size,"unreadCount",unread(actor),"latestId",latest);
    }
    @Transactional
    public void read(long id,CustomUserDetails actor) {
        if(db.queryForObject("SELECT COUNT(*) FROM app_notifications WHERE id=? AND recipient_id=?",Integer.class,id,actor.getId())==0)
            throw new AdminOperationException(NOT_FOUND,"Không tìm thấy thông báo");
        db.update("UPDATE app_notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND recipient_id=?",ClassroomService.now(),id,actor.getId());
    }
    @Transactional
    public void readAll(long upToId,CustomUserDetails actor) {
        if(upToId<0) throw new AdminOperationException(BAD_REQUEST,"Mốc thông báo không hợp lệ");
        db.update("UPDATE app_notifications SET read_at=? WHERE recipient_id=? AND read_at IS NULL AND id<=?",ClassroomService.now(),actor.getId(),upToId);
    }
}
