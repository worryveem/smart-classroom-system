package iot.iot;

import iot.iot.classroom.*;
import iot.iot.dto.*;
import iot.iot.dto.request.ControlRequest;
import iot.iot.dto.response.ControlResponse;
import iot.iot.entity.*;
import iot.iot.exception.IntegrationException;
import iot.iot.repository.UserRepository;
import iot.iot.security.user.CustomUserDetails;
import iot.iot.service.ControlService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.test.util.ReflectionTestUtils;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ClassroomControlTests {
    private final ClassroomService classroom=mock(ClassroomService.class);
    private final ControlService control=mock(ControlService.class);
    private final UserRepository users=mock(UserRepository.class);
    private final RoomIotAccess access=mock(RoomIotAccess.class);
    private final ClassroomControlService service=new ClassroomControlService(classroom,control,users,access);
    private final ControlRequest input=new ControlRequest(ControlTarget.FAN,ControlAction.ON);
    private CustomUserDetails actor() {
        var user=new User(); user.setUsername("teacher"); user.setRole(UserRole.TEACHER); ReflectionTestUtils.setField(user,"id",2L);
        return new CustomUserDetails(user);
    }
    @Test void deniedBookingNeverDispatches() {
        var actor=actor(); when(classroom.beginAttempt(actor,"FAN","ON")).thenThrow(new AccessDeniedException("Forbidden"));
        assertThrows(AccessDeniedException.class,()->service.execute(input,actor)); verifyNoInteractions(control);
    }
    @Test void persistenceFailureBeforeDispatchNeverSendsPhysicalCommand() {
        var actor=actor(); when(classroom.beginAttempt(actor,"FAN","ON")).thenThrow(new org.springframework.dao.DataAccessResourceFailureException("unavailable"));
        assertThrows(org.springframework.dao.DataAccessException.class,()->service.execute(input,actor)); verifyNoInteractions(control);
    }
    @Test void resultPersistenceFailureNeverRetriesOrHidesSuccessfulAck() {
        var actor=actor(); when(classroom.beginAttempt(actor,"FAN","ON")).thenReturn(7L);
        var response=new ControlResponse("node2_actuator",ControlTarget.FAN,ControlAction.ON,"teacher",CommandStatus.SUCCESS,CommandLogStatus.SAVED,false,null);
        when(control.control(input,"teacher")).thenReturn(response);
        doThrow(new org.springframework.dao.DataAccessResourceFailureException("unavailable")).when(classroom).finishAttempt(eq(7L),anyString(),anyString(),anyString());
        assertSame(response,service.execute(input,actor)); verify(control,times(1)).control(input,"teacher");
    }
    @Test void uncorrelatedResponseDoesNotBecomeConfirmedFailureOrRetry() {
        var actor=actor(); when(classroom.beginAttempt(actor,"FAN","ON")).thenReturn(7L);
        var response=new ControlResponse("node2_actuator",ControlTarget.FAN,ControlAction.ON,"teacher",CommandStatus.FAILURE,CommandLogStatus.NOT_RECORDED,false,null);
        var error=new IntegrationException(HttpStatus.BAD_GATEWAY,"Node-RED returned an invalid or uncorrelated response",response);
        when(control.control(input,"teacher")).thenThrow(error);
        assertSame(error,assertThrows(IntegrationException.class,()->service.execute(input,actor)));
        verify(classroom).finishAttempt(eq(7L),eq("UNCONFIRMED"),eq("NOT_RECORDED"),anyString()); verify(control,times(1)).control(input,"teacher");
    }
}
