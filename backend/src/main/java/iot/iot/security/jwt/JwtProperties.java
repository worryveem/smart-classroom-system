package iot.iot.security.jwt;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.jwt")
public record JwtProperties(String secret, long expiration) {
    @Override public String toString() { return "JwtProperties[redacted]"; }
}
