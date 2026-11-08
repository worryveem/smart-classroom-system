package iot.iot;

import iot.iot.config.DataSeeder;
import iot.iot.config.SeedProperties;
import iot.iot.entity.User;
import iot.iot.repository.DeviceRepository;
import iot.iot.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DataSeederTests {
    @Test
    void existingAccountsAndDevicesAreNeverOverwrittenEvenWithoutSeedSecrets() {
        var users = mock(UserRepository.class);
        var devices = mock(DeviceRepository.class);
        when(users.existsByUsername(anyString())).thenReturn(true);
        when(devices.existsByDeviceId(anyString())).thenReturn(true);
        var encoder = mock(BCryptPasswordEncoder.class);
        var seeder = new DataSeeder(users, devices, encoder, new SeedProperties());
        assertDoesNotThrow(() -> seeder.run());
        verify(users, never()).save(any(User.class));
        verify(devices, never()).save(any());
        verifyNoInteractions(encoder);
    }

    @Test
    void missingPasswordFailsClearlyWithoutLeakingSecrets() {
        var users = mock(UserRepository.class);
        var devices = mock(DeviceRepository.class);
        when(devices.existsByDeviceId(anyString())).thenReturn(true);
        var encoder = mock(BCryptPasswordEncoder.class);
        var seeder = new DataSeeder(users, devices, encoder, new SeedProperties());
        var error = assertThrows(IllegalStateException.class, () -> seeder.run());
        assertTrue(error.getMessage().contains("admin"));
        verify(users, never()).save(any(User.class));
        verifyNoInteractions(encoder);
    }

    @Test
    void oversizedUtf8PasswordsCannotBeSilentlyTruncatedByBCrypt() {
        var users = mock(UserRepository.class);
        var devices = mock(DeviceRepository.class);
        when(devices.existsByDeviceId(anyString())).thenReturn(true);
        var properties = new SeedProperties();
        properties.setAdminPassword("é".repeat(37));
        var seeder = new DataSeeder(users, devices, mock(BCryptPasswordEncoder.class), properties);
        assertThrows(IllegalStateException.class, () -> seeder.run());
        verify(users, never()).save(any(User.class));
    }
}
