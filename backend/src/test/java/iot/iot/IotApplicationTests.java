package iot.iot;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

// Real MySQL only: ordinary builds do not silently substitute an incompatible H2 schema.
@SpringBootTest(properties = "app.seed.enabled=false")
@EnabledIfEnvironmentVariable(named = "SMARTCLASS_MYSQL_TEST_URL", matches = ".+")
class IotApplicationTests {
    @DynamicPropertySource
    static void mysql(DynamicPropertyRegistry registry) {
        registry.add("app.jwt.secret", MySqlTestSupport::jwtSecret);
        registry.add("spring.datasource.url", () -> MySqlTestSupport.url("_context"));
    }

    @Test
    void contextLoads() {}
}
