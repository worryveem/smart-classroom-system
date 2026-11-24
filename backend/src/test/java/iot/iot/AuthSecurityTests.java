package iot.iot;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Jwts;
import iot.iot.common.ApiResponse;
import iot.iot.config.PasswordHashingConfig;
import iot.iot.controller.AuthController;
import iot.iot.entity.User;
import iot.iot.entity.UserRole;
import iot.iot.exception.GlobalExceptionHandler;
import iot.iot.repository.UserRepository;
import iot.iot.security.SecurityResponseWriter;
import iot.iot.security.config.CorsConfig;
import iot.iot.security.config.SecurityConfig;
import iot.iot.security.jwt.*;
import iot.iot.security.user.*;
import iot.iot.service.AuthService;
import java.time.Instant;
import java.util.*;
import javax.crypto.SecretKey;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = AuthController.class)
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import({SecurityConfig.class, CorsConfig.class, JwtService.class, JwtAuthenticationFilter.class,
    JwtAuthenticationEntryPoint.class, SecurityResponseWriter.class, CustomUserDetailsService.class,
    PasswordHashingConfig.class, AuthService.class, GlobalExceptionHandler.class, AuthSecurityTests.ProbeController.class})
class AuthSecurityTests {
    private static final SecretKey KEY = Jwts.SIG.HS256.key().build();
    @DynamicPropertySource
    static void config(DynamicPropertyRegistry properties) {
        properties.add("app.jwt.secret", () -> Base64.getEncoder().encodeToString(KEY.getEncoded()));
        properties.add("app.jwt.expiration", () -> 7200000);
    }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JwtService jwt;
    @MockitoBean UserRepository repository;
    private final Map<String,User> users = new HashMap<>();
    @BeforeEach
    void setup() {
        long id = 1;
        for (UserRole role : UserRole.values()) {
            User user = new User(); user.setUsername(role.name().toLowerCase(Locale.ROOT)); user.setRole(role);
            ReflectionTestUtils.setField(user,"id",id++);
            // Low cost fixture; real seeded cost-12 hashes are tested on MySQL/HTTP separately.
            user.setPasswordHash(new BCryptPasswordEncoder(4).encode("CorrectPassword!"));
            users.put(user.getUsername(),user);
        }
        when(repository.findByUsername(anyString())).thenAnswer(inv -> Optional.ofNullable(users.get(inv.getArgument(0))));
    }
    private String token(String username) { return jwt.generateToken(new CustomUserDetails(users.get(username))); }
    private String loginBody(String username, String password) throws Exception {
        return mapper.writeValueAsString(Map.of("username",username,"password",password));
    }

    @ParameterizedTest
    @CsvSource({"admin,ADMIN,1","teacher,TEACHER,2","student,STUDENT,3"})
    void loginUsesBCryptAndReturnsVerifiedJwt(String username, String role, long id) throws Exception {
        var result = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(loginBody(username,"CorrectPassword!")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.tokenType").value("Bearer"))
            .andExpect(jsonPath("$.data.expiresIn").value(7200))
            .andExpect(jsonPath("$.data.user.username").value(username))
            .andExpect(jsonPath("$.data.user.id").value(id)).andExpect(jsonPath("$.data.user.role").value(role))
            .andExpect(jsonPath("$.data.user.passwordHash").doesNotExist())
            .andExpect(header().string("Cache-Control","no-store")).andReturn();
        String body = result.getResponse().getContentAsString();
        String accessToken = mapper.readTree(body).path("data").path("accessToken").asText();
        assertEquals(username,jwt.validateAndGetClaims(accessToken).getSubject());
        assertFalse(body.contains("$2a$")); assertNull(result.getRequest().getSession(false));
    }
    @Test
    void wrongPasswordAndUnknownUserAreIndistinguishable() throws Exception {
        String first = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(loginBody("admin","wrong")))
            .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.message").value("Invalid username or password"))
            .andReturn().getResponse().getContentAsString();
        String second = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(loginBody("missing","wrong")))
            .andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
        assertEquals(first,second);
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(loginBody("admin","CorrectPassword! ")))
            .andExpect(status().isUnauthorized());
    }
    @ParameterizedTest
    @ValueSource(strings={"{}","{\"username\":\"admin\"}","{\"password\":\"test\"}","{\"username\":\" \",\"password\":\"test\"}","{\"username\":\"admin\",\"password\":\" \"}","not-json"})
    void invalidLoginRequestsAre400(String body) throws Exception {
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.success").value(false))
            .andExpect(jsonPath("$.message").value("Invalid request"));
        verifyNoInteractions(repository);
    }
    @Test
    void rejectsOversizedUnicodePassword() throws Exception {
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(loginBody("admin","ÃƒÆ’Ã‚Â©".repeat(37))))
            .andExpect(status().isBadRequest());
        verifyNoInteractions(repository);
    }
    @Test
    void meUsesAuthenticatedDatabaseIdentityAndDoesNotCreateSession() throws Exception {
        String bearer = token("student");
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/me").param("token",bearer)).andExpect(status().isUnauthorized());
        var result=mvc.perform(get("/api/auth/me").param("username","admin").param("id","1").header("Authorization","Bearer "+bearer))
            .andExpect(status().isOk()).andExpect(jsonPath("$.data.username").value("student"))
            .andExpect(jsonPath("$.data.id").value(3)).andExpect(jsonPath("$.data.role").value("STUDENT"))
            .andExpect(jsonPath("$.data.passwordHash").doesNotExist()).andReturn();
        assertNull(result.getRequest().getSession(false));
        assertNull(result.getResponse().getHeader("Set-Cookie"));
    }
    @ParameterizedTest
    @CsvSource({"admin,200","teacher,403","student,403"})
    void checksAdminAndSharedEndpointPolicy(String username, int adminStatus) throws Exception {
        String bearer="Bearer "+token(username);
        mvc.perform(get("/api/users/test").header("Authorization",bearer)).andExpect(status().is(adminStatus));
        mvc.perform(get("/api/state").header("Authorization",bearer)).andExpect(status().isOk());
        mvc.perform(get("/api/test/method-admin").header("Authorization",bearer)).andExpect(status().is(adminStatus));
    }
    @Test
    void anonymousUsersCannotAccessProtectedRoutes() throws Exception {
        for(String endpoint:List.of("/api/users/test","/api/state","/api/control","/api/telemetry","/api/commands","/api/devices","/api/devices/example")) {
            mvc.perform(get(endpoint)).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.success").value(false));
        }
    }
    @Test
    void currentDatabaseRoleOverridesOldJwtRoleAndDeletedUserIsRejected() throws Exception {
        String bearer="Bearer "+token("admin");
        users.get("admin").setRole(UserRole.STUDENT);
        mvc.perform(get("/api/users/test").header("Authorization",bearer)).andExpect(status().isForbidden());
        mvc.perform(get("/api/auth/me").header("Authorization",bearer)).andExpect(status().isOk())
            .andExpect(jsonPath("$.data.role").value("STUDENT"));
        users.remove("admin");
        mvc.perform(get("/api/auth/me").header("Authorization",bearer)).andExpect(status().isUnauthorized());
    }
    @ParameterizedTest
    @ValueSource(strings={"Bearer ","Basic abc","Bearer nonsense","Bearer bad.jwt.value"})
    void invalidAuthorizationHeadersAre401(String header) throws Exception {
        mvc.perform(get("/api/auth/me").header("Authorization",header)).andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.message").value("Unauthorized"));
    }
    @Test
    void expiredAndWrongSignatureJwtAre401() throws Exception {
        String expired=Jwts.builder().issuer("smartclass-backend").subject("admin").claim("role","ADMIN")
            .issuedAt(Date.from(Instant.now().minusSeconds(20))).expiration(Date.from(Instant.now().minusSeconds(10)))
            .signWith(KEY).compact();
        String wrong=Jwts.builder().subject("admin").signWith(Jwts.SIG.HS256.key().build()).compact();
        for(String token:List.of(expired,wrong)) {
            mvc.perform(get("/api/auth/me").header("Authorization","Bearer "+token)).andExpect(status().isUnauthorized());
        }
    }
    @ParameterizedTest
    @ValueSource(strings={"GET","POST","PUT","PATCH","DELETE","OPTIONS"})
    void corsPreflightWorksBeforeAuthentication(String method) throws Exception {
        mvc.perform(options("/api/auth/me").header("Origin","http://localhost:5173")
            .header("Access-Control-Request-Method",method).header("Access-Control-Request-Headers","Authorization,Content-Type"))
            .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin","http://localhost:5173"))
            .andExpect(header().doesNotExist("Access-Control-Allow-Credentials"));
    }
    @Test
    void corsIncludesHeadersOnUnauthorizedAndRejectsUnknownOrigin() throws Exception {
        mvc.perform(get("/api/auth/me").header("Origin","http://localhost:5173"))
            .andExpect(status().isUnauthorized()).andExpect(header().string("Access-Control-Allow-Origin","http://localhost:5173"));
        mvc.perform(options("/api/auth/login").header("Origin","https://untrusted.example")
            .header("Access-Control-Request-Method","POST")).andExpect(status().isForbidden())
            .andExpect(header().doesNotExist("Access-Control-Allow-Origin"))
            .andExpect(jsonPath("$.message").value("Forbidden"));
    }
    @Test
    void unexpectedErrorsAreSanitizedAndMethodSecurityIs403() throws Exception {
        mvc.perform(get("/api/test/error").header("Authorization","Bearer "+token("admin")))
            .andExpect(status().isInternalServerError()).andExpect(jsonPath("$.message").value("Internal server error"))
            .andExpect(jsonPath("$.data").isEmpty());
    }

    @Test
    void infrastructureFailuresAreSanitized500ForLoginAndJwtRequests() throws Exception {
        String bearer = token("admin");
        when(repository.findByUsername("admin")).thenThrow(
            new org.springframework.dao.DataAccessResourceFailureException("internal connection detail"));
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
            .content(loginBody("admin","CorrectPassword!")))
            .andExpect(status().isInternalServerError()).andExpect(jsonPath("$.message").value("Internal server error"));
        mvc.perform(get("/api/auth/me").header("Authorization","Bearer "+bearer))
            .andExpect(status().isInternalServerError()).andExpect(jsonPath("$.message").value("Internal server error"));
    }

    @Test
    void unsupportedMediaTypeRemainsAClientError() throws Exception {
        mvc.perform(post("/api/auth/login").contentType(MediaType.TEXT_PLAIN).content("username=admin"))
            .andExpect(status().isUnsupportedMediaType()).andExpect(jsonPath("$.message").value("Unsupported media type"));
        verifyNoInteractions(repository);
    }

    // Never included in src/main or the application JAR.
    @org.springframework.boot.test.context.TestComponent
    @RestController
    static class ProbeController {
        @GetMapping("/api/users/test") ApiResponse<String> admin() { return ApiResponse.ok("ok","admin"); }
        @GetMapping("/api/state") ApiResponse<String> shared() { return ApiResponse.ok("ok","shared"); }
        @PreAuthorize("hasRole('ADMIN')")
        @GetMapping("/api/test/method-admin") ApiResponse<String> methodAdmin() { return ApiResponse.ok("ok","admin"); }
        @GetMapping("/api/test/error") ApiResponse<String> error() { throw new IllegalStateException("internal database detail"); }
    }
}
