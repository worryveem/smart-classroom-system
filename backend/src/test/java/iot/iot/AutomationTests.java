package iot.iot;

import iot.iot.ai.*;
import iot.iot.classroom.*;
import iot.iot.dto.*;
import iot.iot.dto.response.ControlResponse;
import iot.iot.entity.*;
import iot.iot.repository.UserRepository;
import iot.iot.security.user.CustomUserDetails;
import iot.iot.service.ControlService;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AutomationTests {
    final JdbcTemplate db=mock(JdbcTemplate.class);
    final ClassroomService classroom=mock(ClassroomService.class);
    final RoomIotAccess access=mock(RoomIotAccess.class);
    final UserRepository users=mock(UserRepository.class);
    final ControlService control=mock(ControlService.class);
    final AutomationService service=spy(new AutomationService(db,classroom,access,users,control));
    final Map<String,Object> state=new HashMap<>();
    final Map<String,Object> sample=new HashMap<>();
    @BeforeEach void setup() {
        when(service.exclusive(any())).thenAnswer(call -> ((Supplier<?>)call.getArgument(0)).get());
        state.putAll(Map.of("enabled",true,"enabled_by",81L,"in_flight",false,"fan_on",30.,"fan_off",28.,"light_on",150.,"light_off",250.,"empty_seconds",300));
        sample.putAll(Map.of("temp",32.,"lux",100.,"occupancy",true,"timestamp",ClassroomService.now().minusSeconds(5)));
        when(db.queryForMap("SELECT * FROM room_automation WHERE room_id=101")).thenReturn(state);
        var user=mock(User.class);when(user.getId()).thenReturn(81L);when(user.getRole()).thenReturn(UserRole.TEACHER);
        when(users.findById(81L)).thenReturn(Optional.of(user));
        when(classroom.permission(any(),eq(101))).thenReturn(Map.of("allowed",true,"reason","Được phép"));
        when(access.sensorId()).thenReturn("node1_sensor");
        when(db.queryForList(contains("ORDER BY `timestamp` DESC"),eq("node1_sensor"))).thenReturn(List.of(sample));
        when(control.automatic(any())).thenAnswer(call -> {
            var r=(iot.iot.dto.request.ControlRequest)call.getArgument(0);
            return new ControlResponse("node2_actuator",r.target(),r.action(),"RULE_ENGINE",CommandStatus.SUCCESS,CommandLogStatus.SAVED,false,null);
        });
    }
    @Test void hysteresisBoundariesAndDeadBand() {
        assertEquals(ControlAction.ON,AutomationPolicy.decide(30,30,28,true));
        assertEquals(ControlAction.OFF,AutomationPolicy.decide(28,30,28,true));
        assertNull(AutomationPolicy.decide(29,30,28,true));
        assertEquals(ControlAction.ON,AutomationPolicy.decide(150,150,250,false));
        assertEquals(ControlAction.OFF,AutomationPolicy.decide(250,150,250,false));
        assertNull(AutomationPolicy.decide(200,150,250,false));
        assertNull(AutomationPolicy.decide(Double.NaN,30,28,true));
    }
    @Test void disabledNeverDispatches() { state.put("enabled",false);service.tick();verifyNoInteractions(control); }
    @Test void validOccupiedSampleSendsBothTargets() {
        service.tick();verify(control,times(2)).automatic(any());
        verify(control).automatic(new iot.iot.dto.request.ControlRequest(ControlTarget.FAN,ControlAction.ON));
        verify(control).automatic(new iot.iot.dto.request.ControlRequest(ControlTarget.LIGHT,ControlAction.ON));
    }
    @Test void acknowledgedStateIsNotResent() {
        state.put("fan_action","ON");state.put("light_action","ON");service.tick();verifyNoInteractions(control);
    }
    @Test void cooldownPreventsRapidChanges() {
        state.put("fan_changed_at",ClassroomService.now().minusSeconds(10));state.put("light_changed_at",ClassroomService.now().minusSeconds(10));
        service.tick();verifyNoInteractions(control);
    }
    @Test void staleOrFutureSampleNeverDispatches() {
        for(var time:List.of(ClassroomService.now().minusSeconds(61),ClassroomService.now().plusSeconds(60))) {
            sample.put("timestamp",time);service.tick();
        }
        verifyNoInteractions(control);
    }
    @Test void permissionExpiryAndUnfinishedCommandNeverDispatch() {
        when(classroom.permission(any(),eq(101))).thenReturn(Map.of("allowed",false));
        service.tick();state.put("in_flight",true);service.tick();verifyNoInteractions(control);
    }
    @Test void unconfirmedCommandStopsWithoutRetryingOrSendingOtherTarget() {
        doReturn(new ControlResponse("node2_actuator",ControlTarget.FAN,ControlAction.ON,"RULE_ENGINE",CommandStatus.ACCEPTED,CommandLogStatus.SAVED,false,null)).when(control).automatic(any());
        service.tick();verify(control,times(1)).automatic(any());
        verify(db).update(contains("enabled=FALSE"),contains("Đã dừng"),any());
    }
    @Test void missingMeasurementNeverDispatches() {
        sample.remove("lux");service.tick();verifyNoInteractions(control);
    }
    @Test void noMotionNeedsContinuousHistoryBeforeOff() {
        sample.put("occupancy",false);
        var end=ClassroomService.now();var history=new ArrayList<Map<String,Object>>();
        for(int s=330;s>=0;s-=30) history.add(Map.of("occupancy",false,"timestamp",end.minusSeconds(s)));
        when(db.queryForList(contains("ORDER BY `timestamp`,id"),eq("node1_sensor"),any(),any())).thenReturn(history);
        service.tick();
        verify(control).automatic(new iot.iot.dto.request.ControlRequest(ControlTarget.FAN,ControlAction.OFF));
        verify(control).automatic(new iot.iot.dto.request.ControlRequest(ControlTarget.LIGHT,ControlAction.OFF));
    }
    @Test void gapsInNoMotionHistoryDoNotTurnDevicesOff() {
        sample.put("occupancy",false);var now=ClassroomService.now();
        when(db.queryForList(contains("ORDER BY `timestamp`,id"),eq("node1_sensor"),any(),any()))
            .thenReturn(List.of(Map.of("occupancy",false,"timestamp",now.minusSeconds(330)),Map.of("occupancy",false,"timestamp",now)));
        service.tick();verifyNoInteractions(control);
    }
    @Test void teacherWithoutActiveBookingCannotChangeMode() {
        var user=mock(User.class);when(user.getRole()).thenReturn(UserRole.TEACHER);
        var actor=new CustomUserDetails(user);
        when(classroom.permission(actor,101)).thenReturn(Map.of("allowed",false));
        assertThrows(org.springframework.security.access.AccessDeniedException.class,()->service.save(new AutomationService.Settings(true,30.,28.,150.,250.,300),actor));
        verify(db,never()).update(startsWith("UPDATE room_automation SET enabled=?"),any(Object[].class));
        verifyNoInteractions(control);
    }
}
