package iot.iot;

import iot.iot.classroom.IncidentListController;
import iot.iot.entity.*;
import iot.iot.security.user.CustomUserDetails;
import org.junit.jupiter.api.*;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class IncidentListTests {
    final JdbcTemplate db=mock(JdbcTemplate.class);
    final IncidentListController controller=new IncidentListController(db);
    CustomUserDetails actor(UserRole role) {
        var user=mock(User.class);when(user.getId()).thenReturn(81L);when(user.getRole()).thenReturn(role);
        return new CustomUserDetails(user);
    }
    @BeforeEach void setup() {
        when(db.queryForObject(anyString(),eq(Long.class),any(Object[].class))).thenReturn(12L);
        when(db.queryForList(anyString(),any(Object[].class))).thenReturn(java.util.List.of());
    }
    @Test void adminQueriesAllRoomsWithoutReporterRestriction() {
        controller.list(actor(UserRole.ADMIN),0,10,null,null);
        var sql=ArgumentCaptor.forClass(String.class);var args=ArgumentCaptor.forClass(Object[].class);
        verify(db).queryForList(sql.capture(),args.capture());
        assertFalse(sql.getValue().contains("reporter_id=?"));
        assertFalse(sql.getValue().contains("i.room_id=?"));
        assertArrayEquals(new Object[]{10,0L},args.getValue());
    }
    @Test void teacherAndStudentAlwaysQueryOwnReports() {
        for(var role:java.util.List.of(UserRole.TEACHER,UserRole.STUDENT)) {
            clearInvocations(db);
            controller.list(actor(role),1,10,102,"OPEN");
            var sql=ArgumentCaptor.forClass(String.class);var args=ArgumentCaptor.forClass(Object[].class);
            verify(db).queryForList(sql.capture(),args.capture());
            assertTrue(sql.getValue().contains("i.reporter_id=?"));
            assertArrayEquals(new Object[]{81L,102,"OPEN",10,10L},args.getValue());
            verify(db).queryForObject(contains("i.reporter_id=?"),eq(Long.class),eq(81L),eq(102),eq("OPEN"));
        }
    }
    @Test void invalidFiltersNeverQueryDatabase() {
        clearInvocations(db);var actor=actor(UserRole.ADMIN);
        assertThrows(iot.iot.exception.AdminOperationException.class,()->controller.list(actor,-1,10,null,null));
        assertThrows(iot.iot.exception.AdminOperationException.class,()->controller.list(actor,0,51,null,null));
        assertThrows(iot.iot.exception.AdminOperationException.class,()->controller.list(actor,0,10,null,"UNKNOWN"));
        verifyNoInteractions(db);
    }
}
