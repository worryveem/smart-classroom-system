package iot.iot.classroom;

import iot.iot.dto.request.ControlRequest;
import iot.iot.dto.response.ControlResponse;
import iot.iot.exception.IntegrationException;
import iot.iot.security.user.CustomUserDetails;
import iot.iot.service.ControlService;
import iot.iot.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class ClassroomControlService {
    private static final Logger log=LoggerFactory.getLogger(ClassroomControlService.class);
    private final ClassroomService classroom;
    private final ControlService control;
    private final UserRepository users;
    private final RoomIotAccess access;
    private final iot.iot.ai.AutomationService automation;
    public ClassroomControlService(ClassroomService classroom,ControlService control,UserRepository users,RoomIotAccess access,iot.iot.ai.AutomationService automation) { this.classroom=classroom; this.control=control; this.users=users; this.access=access; this.automation=automation; }
    // Each persistence call commits separately; never hold a transaction during IoT HTTP.
    public ControlResponse execute(ControlRequest input,CustomUserDetails actor) {
        return execute(input,actor,101);
    }
    public ControlResponse execute(ControlRequest input,CustomUserDetails actor,int roomId) {
        return automation.exclusive(() -> { automation.requireManual(); return executeManual(input,actor,roomId); });
    }
    private ControlResponse executeManual(ControlRequest input,CustomUserDetails actor,int roomId) {
        if(users.matchesReservedCommandActor(actor.getUsername())!=0)
            throw new IntegrationException(HttpStatus.FORBIDDEN,"Username RULE_ENGINE is reserved for automatic commands");
        access.requireActuator(roomId);
        long id=classroom.beginAttempt(actor,input.target().name(),input.action().name());
        try {
            var result=control.control(input,actor.getUsername());
            finish(id,result.status().name(),result.logStatus().name(),"Phản hồi từ Node-RED: "+result.status());
            return result;
        } catch(IntegrationException error) {
            if(error.getData() instanceof ControlResponse response) {
                String status=response.status().name();
                if(status.equals("FAILURE") && !error.getMessage().startsWith("Node-RED reported command failure")) status="UNCONFIRMED";
                finish(id,status,response.logStatus().name(),error.getMessage());
            }
            else finish(id,"UNCONFIRMED","NOT_RECORDED",error.getMessage());
            throw error;
        } catch(RuntimeException error) {
            finish(id,"UNCONFIRMED","NOT_RECORDED","Lỗi hệ thống; kiểm tra trạng thái thiết bị trước khi gửi lại");
            throw error;
        }
    }
    private void finish(long id,String status,String logStatus,String message) {
        try { classroom.finishAttempt(id,status,logStatus,message); }
        catch(RuntimeException error) {
            // Keep PENDING as evidence of an unconfirmed attempt. Do not mask the physical command result.
            log.warn("Could not complete command attempt {} ({})",id,error.getClass().getSimpleName());
        }
    }
}
