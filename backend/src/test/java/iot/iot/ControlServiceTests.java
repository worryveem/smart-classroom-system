package iot.iot;

import com.fasterxml.jackson.databind.ObjectMapper;
import iot.iot.dto.*;
import iot.iot.dto.request.ControlRequest;
import iot.iot.exception.IntegrationException;
import iot.iot.integration.nodered.*;
import iot.iot.repository.DeviceRepository;
import iot.iot.repository.UserRepository;
import iot.iot.service.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ControlServiceTests {
    private final NodeRedClient client=mock(NodeRedClient.class);
    private final DeviceRepository devices=mock(DeviceRepository.class);
    private final CommandAuditService audit=mock(CommandAuditService.class);
    private final UserRepository users=mock(UserRepository.class);
    private final NodeRedProperties properties=new NodeRedProperties("http://127.0.0.1:1880","/state","/cmd",3000,15000,"node2_actuator");
    private final ControlService service=new ControlService(client,devices,audit,properties,users);
    private final ControlRequest request=new ControlRequest(ControlTarget.FAN,ControlAction.ON);
    @BeforeEach void setup() { when(devices.existsByDeviceId("node2_actuator")).thenReturn(true); }
    @Test
    void missingDeviceNeverDispatches() {
        when(devices.existsByDeviceId("node2_actuator")).thenReturn(false);
        assertEquals(HttpStatus.NOT_FOUND,assertThrows(IntegrationException.class,()->service.control(request,"teacher")).getStatus());
        verifyNoInteractions(client,audit);
    }
    @Test
    void reservedLegacyActorNeverDispatchesOrWritesAnAutomaticLog() {
        when(users.matchesReservedCommandActor("rule_engine")).thenReturn(1);
        var error=assertThrows(IntegrationException.class,()->service.control(request,"rule_engine"));
        assertEquals(HttpStatus.FORBIDDEN,error.getStatus());
        assertEquals("Username RULE_ENGINE is reserved for automatic commands",error.getMessage());
        verifyNoInteractions(client,audit,devices);
    }
    @Test
    void acceptedCommandIsLoggedOnceAfterConfirmationWithSecurityUsername() throws Exception {
        when(client.command(any())).thenReturn(new NodeRedCommandResponse(CommandStatus.ACCEPTED,new ObjectMapper().readTree("{\"msg\":\"ACCEPTED\"}")));
        var response=service.control(request,"teacher");
        assertEquals(CommandStatus.ACCEPTED,response.status()); assertEquals("teacher",response.triggerBy());
        var order=inOrder(devices,client,audit);
        order.verify(devices).existsByDeviceId("node2_actuator");order.verify(client).command(any());
        order.verify(audit).recordConfirmed(eq("node2_actuator"),any(),eq("teacher"));order.verifyNoMoreInteractions();
    }
    @Test
    void failedOrUnconfirmedCommandsAreNeverRecordedOrRetried() {
        when(client.command(any())).thenThrow(new IntegrationException(HttpStatus.GATEWAY_TIMEOUT,"timeout"));
        var error=assertThrows(IntegrationException.class,()->service.control(request,"teacher"));
        assertEquals(HttpStatus.GATEWAY_TIMEOUT,error.getStatus()); verify(client,times(1)).command(any());verifyNoInteractions(audit);
        var data=(iot.iot.dto.response.ControlResponse)error.getData();
        assertEquals(CommandStatus.TIMEOUT,data.status()); assertFalse(data.retrySafe());
    }
    @Test
    void auditFailurePreservesConfirmedOutcomeAndDoesNotDispatchAgain() throws Exception {
        when(client.command(any())).thenReturn(new NodeRedCommandResponse(CommandStatus.SUCCESS,new ObjectMapper().readTree("{\"msg\":\"SUCCESS\"}")));
        doThrow(new DataIntegrityViolationException("internal sql detail")).when(audit).recordConfirmed(anyString(),any(),anyString());
        var error=assertThrows(IntegrationException.class,()->service.control(request,"teacher"));
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR,error.getStatus());assertFalse(error.getMessage().contains("internal sql detail"));
        var data=(iot.iot.dto.response.ControlResponse)error.getData();
        assertEquals(CommandStatus.SUCCESS,data.status());assertEquals(CommandLogStatus.FAILED,data.logStatus());assertFalse(data.retrySafe());
        verify(client,times(1)).command(any());
    }
}
