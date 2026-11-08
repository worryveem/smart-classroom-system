package iot.iot.exception;

import org.springframework.http.HttpStatus;

public class IntegrationException extends RuntimeException {
    private final HttpStatus status;
    private final Object data;
    public IntegrationException(HttpStatus status, String message) { this(status, message, null); }
    public IntegrationException(HttpStatus status, String message, Object data) {
        super(message); this.status = status; this.data = data;
    }
    public HttpStatus getStatus() { return status; }
    public Object getData() { return data; }
}
