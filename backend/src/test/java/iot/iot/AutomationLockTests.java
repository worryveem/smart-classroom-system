package iot.iot;

import iot.iot.ai.AutomationService;
import java.sql.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AutomationLockTests {
    final JdbcTemplate db=mock(JdbcTemplate.class);
    final Connection connection=mock(Connection.class);
    final Statement name=mock(Statement.class);
    final PreparedStatement acquire=mock(PreparedStatement.class),release=mock(PreparedStatement.class);
    final ResultSet nameRows=mock(ResultSet.class),lockRows=mock(ResultSet.class);
    final AutomationService service=new AutomationService(db,null,null,null,null);
    @BeforeEach void setup() throws Exception {
        doAnswer(call -> ((ConnectionCallback<?>)call.getArgument(0)).doInConnection(connection))
            .when(db).execute(org.mockito.ArgumentMatchers.<ConnectionCallback<Object>>any());
        when(connection.createStatement()).thenReturn(name);
        when(name.executeQuery(anyString())).thenReturn(nameRows);
        when(nameRows.getString(1)).thenReturn("database-specific-lock");
        when(connection.prepareStatement("SELECT GET_LOCK(?,0)")).thenReturn(acquire);
        when(connection.prepareStatement("SELECT RELEASE_LOCK(?)")).thenReturn(release);
        when(acquire.executeQuery()).thenReturn(lockRows);
        when(lockRows.getInt(1)).thenReturn(1);
    }
    @Test void releasesNamedLockEvenWhenWorkFails() throws Exception {
        assertThrows(IllegalStateException.class,()->service.exclusive(()->{throw new IllegalStateException("lỗi");}));
        verify(release).setString(1,"database-specific-lock");verify(release).execute();
    }
    @Test void busyLockNeverExecutesWork() throws Exception {
        when(lockRows.getInt(1)).thenReturn(0);
        var work=mock(java.util.function.Supplier.class);
        assertThrows(iot.iot.exception.AdminOperationException.class,()->service.exclusive(work));
        verifyNoInteractions(work,release);
    }
}
