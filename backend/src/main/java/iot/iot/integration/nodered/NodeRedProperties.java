package iot.iot.integration.nodered;

import java.net.URI;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.nodered")
public record NodeRedProperties(String baseUrl, String statePath, String commandPath,
                                int connectTimeout, int readTimeout, String actuatorDeviceId) {
    public NodeRedProperties {
        URI base;
        try { base = URI.create(baseUrl); }
        catch (RuntimeException error) { throw new IllegalStateException("NODERED_BASE_URL must be a valid HTTP(S) origin"); }
        if (!("http".equals(base.getScheme()) || "https".equals(base.getScheme()))
            || base.getHost() == null || base.getUserInfo() != null || base.getQuery() != null
            || base.getFragment() != null || !(base.getPath().isEmpty() || base.getPath().equals("/"))) {
            throw new IllegalStateException("NODERED_BASE_URL must be an HTTP(S) origin without credentials or path");
        }
        for (String path : new String[]{statePath, commandPath}) {
            if (path == null || !path.startsWith("/") || path.startsWith("//")
                || path.contains("?") || path.contains("#") || path.contains("\\") || path.contains("..")) {
                throw new IllegalStateException("Node-RED API paths must be absolute local paths without query or traversal");
            }
            try { URI.create(path); }
            catch (IllegalArgumentException error) { throw new IllegalStateException("Invalid Node-RED API path"); }
        }
        if (connectTimeout <= 0 || readTimeout <= 0) {
            throw new IllegalStateException("Node-RED timeouts must be positive milliseconds");
        }
        if (actuatorDeviceId == null || actuatorDeviceId.isBlank() || actuatorDeviceId.length() > 50) {
            throw new IllegalStateException("NODERED_ACTUATOR_DEVICE_ID must contain 1 to 50 characters");
        }
    }
    public URI stateUri() { return URI.create(baseUrl).resolve(statePath); }
    public URI commandUri() { return URI.create(baseUrl).resolve(commandPath); }
}
