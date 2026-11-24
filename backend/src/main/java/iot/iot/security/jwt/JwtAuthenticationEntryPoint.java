package iot.iot.security.jwt;

import iot.iot.security.SecurityResponseWriter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

@Component
public class JwtAuthenticationEntryPoint implements AuthenticationEntryPoint {
    private final SecurityResponseWriter writer;
    public JwtAuthenticationEntryPoint(SecurityResponseWriter writer) { this.writer = writer; }
    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response, AuthenticationException error) throws IOException {
        writer.write(response, 401, "Unauthorized");
    }
}
