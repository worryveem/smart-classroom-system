package iot.iot.security.jwt;

import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import iot.iot.entity.User;
import iot.iot.entity.UserRole;
import iot.iot.security.user.CustomUserDetails;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Date;
import javax.crypto.SecretKey;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class JwtServiceTests {
    private final SecretKey key = Jwts.SIG.HS256.key().build();
    private final String secret = Base64.getEncoder().encodeToString(key.getEncoded());
    private final Instant now = Instant.parse("2026-11-07T08:00:00Z");
    private final Clock clock = Clock.fixed(now, ZoneOffset.UTC);
    private JwtService service(long ttl, Clock time) { return new JwtService(new JwtProperties(secret, ttl), time); }
    private CustomUserDetails user() {
        User user = new User(); user.setUsername("admin"); user.setRole(UserRole.ADMIN);
        org.springframework.test.util.ReflectionTestUtils.setField(user, "id", 1L);
        user.setPasswordHash("must-never-appear-in-jwt");
        return new CustomUserDetails(user);
    }
    @Test
    void signsVerifiesAndExposesOnlyRequiredPublicClaims() {
        var jwt = service(7200000, clock);
        var claims = jwt.validateAndGetClaims(jwt.generateToken(user()));
        assertEquals("admin", claims.getSubject()); assertEquals("ADMIN", claims.get("role"));
        assertEquals(Date.from(now), claims.getIssuedAt());
        assertEquals(Date.from(now.plusSeconds(7200)), claims.getExpiration());
        assertEquals(7200, jwt.getExpiresInSeconds());
        assertFalse(claims.containsKey("password")); assertFalse(claims.containsKey("password_hash"));
    }
    @Test
    void shortTestLifetimeExpiresWithoutChangingNormalConfiguration() {
        String token = service(1000, clock).generateToken(user());
        assertThrows(io.jsonwebtoken.ExpiredJwtException.class,
            () -> service(1000, Clock.fixed(now.plusSeconds(2), ZoneOffset.UTC)).validateAndGetClaims(token));
    }
    @Test
    void rejectsDifferentKeyTamperingUnsignedAndMalformedTokens() {
        var jwt = service(7200000, clock);
        String token = jwt.generateToken(user());
        String[] parts = token.split("\\.");
        String tampered = parts[0] + "." + Base64.getUrlEncoder().withoutPadding()
            .encodeToString("{\"sub\":\"student\",\"role\":\"ADMIN\"}".getBytes(java.nio.charset.StandardCharsets.UTF_8)) + "." + parts[2];
        assertThrows(JwtException.class, () -> jwt.validateAndGetClaims(tampered));
        String wrong = Jwts.builder().subject("admin").signWith(Jwts.SIG.HS256.key().build()).compact();
        assertThrows(JwtException.class, () -> jwt.validateAndGetClaims(wrong));
        assertThrows(JwtException.class, () -> jwt.validateAndGetClaims(Jwts.builder().subject("admin").compact()));
        assertThrows(JwtException.class, () -> jwt.validateAndGetClaims("bad.jwt.value"));
    }
    @Test
    void requiresExpirationIssuedAtIssuerAndKnownRole() {
        var jwt = service(7200000, clock);
        String missingExpiration = Jwts.builder().issuer("smartclass-backend").subject("admin")
            .claim("role", "ADMIN").issuedAt(Date.from(now)).signWith(key).compact();
        assertThrows(JwtException.class, () -> jwt.validateAndGetClaims(missingExpiration));
        String wrongIssuer = Jwts.builder().issuer("other-app").subject("admin")
            .claim("role", "ADMIN").issuedAt(Date.from(now)).expiration(Date.from(now.plusSeconds(60))).signWith(key).compact();
        assertThrows(JwtException.class, () -> jwt.validateAndGetClaims(wrongIssuer));
        String unknownRole = Jwts.builder().issuer("smartclass-backend").subject("admin")
            .claim("role", "SUPERUSER").issuedAt(Date.from(now)).expiration(Date.from(now.plusSeconds(60))).signWith(key).compact();
        assertThrows(JwtException.class, () -> jwt.validateAndGetClaims(unknownRole));
    }
    @Test
    void rejectsTokensWithoutAnImmutablePositiveUserId() {
        var jwt = service(7200000, clock);
        for (Long id : new Long[] {null, 0L, -1L}) {
            String token = Jwts.builder().issuer("smartclass-backend").subject("admin")
                .claim("role", "ADMIN").claim("userId", id).issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(60))).signWith(key).compact();
            assertThrows(JwtException.class, () -> jwt.validateAndGetClaims(token));
        }
    }
    @Test
    void rejectsMissingWeakOrMalformedConfigurationWithoutEchoingSecrets() {
        for (String invalid : new String[]{"", "not base64!", Base64.getEncoder().encodeToString(new byte[16])}) {
            var error = assertThrows(IllegalStateException.class, () -> new JwtService(new JwtProperties(invalid,7200000),clock));
            assertTrue(error.getMessage().contains("JWT_SECRET"));
        }
        assertThrows(IllegalStateException.class, () -> new JwtService(new JwtProperties(secret,0),clock));
        assertFalse(new JwtProperties(secret,7200000).toString().contains(secret));
    }
}
