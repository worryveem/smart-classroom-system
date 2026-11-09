package iot.iot.security.jwt;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.JwtParser;
import io.jsonwebtoken.Jwts;
import iot.iot.entity.UserRole;
import iot.iot.security.user.CustomUserDetails;
import java.time.Clock;
import java.util.Base64;
import java.util.Date;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Service;

@Service
@EnableConfigurationProperties(JwtProperties.class)
public class JwtService {
    private static final String ISSUER = "smartclass-backend";
    private final SecretKey key;
    private final long expiration;
    private final Clock clock;
    private final JwtParser parser;

    @Autowired
    public JwtService(JwtProperties properties) { this(properties, Clock.systemUTC()); }

    JwtService(JwtProperties properties, Clock clock) {
        byte[] decoded;
        try {
            decoded = Base64.getDecoder().decode(properties.secret() == null ? "" : properties.secret());
        } catch (IllegalArgumentException error) {
            throw new IllegalStateException("JWT_SECRET must be valid Base64 with at least 32 random decoded bytes");
        }
        if (decoded.length < 32) {
            throw new IllegalStateException("JWT_SECRET is required: use Base64 of at least 32 cryptographically random bytes");
        }
        if (properties.expiration() < 1000 || properties.expiration() > Long.MAX_VALUE - clock.millis()) {
            throw new IllegalStateException("JWT_EXPIRATION must be milliseconds, at least 1000, without overflowing epoch time");
        }
        this.key = new SecretKeySpec(decoded, "HmacSHA256");
        this.expiration = properties.expiration();
        this.clock = clock;
        this.parser = Jwts.parser().verifyWith(key).requireIssuer(ISSUER)
            .clock(() -> Date.from(clock.instant()))
            .sig().clear().add(Jwts.SIG.HS256).and()
            .zip().clear().and().build();
    }

    public String generateToken(CustomUserDetails user) {
        long now = clock.millis();
        return Jwts.builder().issuer(ISSUER).subject(user.getUsername())
            .claim("userId", user.getId())
            .claim("role", user.getRole().name())
            .claim("credentialsVersion", user.getCredentialsVersion())
            .issuedAt(new Date(now)).expiration(new Date(now + expiration))
            .signWith(key, Jwts.SIG.HS256).compact();
    }

    public Claims validateAndGetClaims(String token) {
        Claims claims = parser.parseSignedClaims(token).getPayload();
        if (claims.getSubject() == null || claims.getSubject().isBlank()
            || claims.getIssuedAt() == null || claims.getExpiration() == null
            || !claims.getExpiration().after(claims.getIssuedAt())
            || claims.getIssuedAt().after(Date.from(clock.instant()))) {
            throw new JwtException("Invalid token claims");
        }
        try { UserRole.valueOf(claims.get("role", String.class)); }
        catch (IllegalArgumentException | NullPointerException error) { throw new JwtException("Invalid token claims"); }
        Long userId = claims.get("userId", Long.class);
        if (userId == null || userId <= 0) throw new JwtException("Invalid token claims");
        return claims;
    }

    public long getExpiresInSeconds() { return expiration / 1000; }
}
