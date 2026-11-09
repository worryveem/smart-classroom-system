package iot.iot;

import iot.iot.ai.AiSettingsController;
import iot.iot.entity.User;
import iot.iot.entity.UserRole;
import iot.iot.security.user.CustomUserDetails;
import jakarta.validation.Validation;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.context.SecurityContextHolder;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AiSettingsTests {
    @Configuration
    @EnableMethodSecurity
    static class Config {
        @Bean JdbcTemplate db() { return mock(JdbcTemplate.class); }
        @Bean AiSettingsController controller(JdbcTemplate db) { return new AiSettingsController(db); }
        @Bean iot.iot.ai.AutomationService automationService() { return mock(iot.iot.ai.AutomationService.class); }
        @Bean iot.iot.ai.AutomationController automationController(iot.iot.ai.AutomationService service) { return new iot.iot.ai.AutomationController(service); }
    }

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    private CustomUserDetails actor(UserRole role) {
        var user = mock(User.class);
        when(user.getId()).thenReturn(81L);
        when(user.getUsername()).thenReturn("ai_test");
        when(user.getRole()).thenReturn(role);
        var actor = new CustomUserDetails(user);
        SecurityContextHolder.getContext().setAuthentication(
            new UsernamePasswordAuthenticationToken(actor, null, actor.getAuthorities()));
        return actor;
    }

    @Test void studentsCannotReadOrWritePreferences() {
        try (var context = new AnnotationConfigApplicationContext(Config.class)) {
            var controller = context.getBean(AiSettingsController.class);
            var actor = actor(UserRole.STUDENT);
            clearInvocations(context.getBean(JdbcTemplate.class));
            assertThrows(AccessDeniedException.class, () -> controller.get(actor));
            assertThrows(AccessDeniedException.class, () -> controller.put(new AiSettingsController.SettingsInput(true), actor));
            verifyNoInteractions(context.getBean(JdbcTemplate.class));
        }
    }

    @Test void staffWriteOnlyAuthenticatedAccount() {
        for (var role : new UserRole[]{UserRole.ADMIN, UserRole.TEACHER}) {
            try (var context = new AnnotationConfigApplicationContext(Config.class)) {
                var controller = context.getBean(AiSettingsController.class);
                controller.put(new AiSettingsController.SettingsInput(true), actor(role));
                verify(context.getBean(JdbcTemplate.class)).update(anyString(), eq(81L), eq(true), eq(true));
            }
        }
    }

    @Test void enabledMustBePresent() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            assertFalse(factory.getValidator().validate(new AiSettingsController.SettingsInput(null)).isEmpty());
        }
    }
    @Test void studentsCannotConfigurePhysicalAutomation() {
        try(var context=new AnnotationConfigApplicationContext(Config.class)) {
            var controller=context.getBean(iot.iot.ai.AutomationController.class);
            var actor=actor(UserRole.STUDENT);
            assertThrows(AccessDeniedException.class,()->controller.get(actor));
            assertThrows(AccessDeniedException.class,()->controller.save(new iot.iot.ai.AutomationService.Settings(true,30.,28.,150.,250.,300),actor));
            verifyNoInteractions(context.getBean(iot.iot.ai.AutomationService.class));
        }
    }
}
