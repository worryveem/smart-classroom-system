package iot.iot.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import iot.iot.common.ApiResponse;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

@Component
public class SecurityResponseWriter {
    private final ObjectMapper mapper;
    public SecurityResponseWriter(ObjectMapper mapper) { this.mapper = mapper; }
    public void write(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.setHeader("Cache-Control", "no-store");
        if (status == 401) response.setHeader("WWW-Authenticate", "Bearer");
        mapper.writeValue(response.getOutputStream(), ApiResponse.error(message));
    }
}
