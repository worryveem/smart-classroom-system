package iot.iot.exception;

import iot.iot.common.ApiResponse;
import jakarta.validation.ConstraintViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.authentication.InternalAuthenticationServiceException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(AdminOperationException.class)
    public ResponseEntity<ApiResponse<Void>> adminOperation(AdminOperationException error) {
        return error(error.getStatus(), error.getMessage());
    }
    @ExceptionHandler(org.springframework.dao.DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponse<Void>> integrityConflict(Exception error) {
        return error(HttpStatus.CONFLICT, "Data conflicts with an existing record or reference");
    }
    @ExceptionHandler(org.springframework.dao.PessimisticLockingFailureException.class)
    public ResponseEntity<ApiResponse<Void>> concurrentChange(Exception error) {
        return error(HttpStatus.CONFLICT, "Concurrent update; refresh and try again");
    }
    @ExceptionHandler(InvalidHistoryQueryException.class)
    public ResponseEntity<ApiResponse<Void>> invalidHistory(InvalidHistoryQueryException error) {
        return error(HttpStatus.BAD_REQUEST, error.getMessage());
    }
    @ExceptionHandler(IntegrationException.class)
    public ResponseEntity<ApiResponse<Object>> integration(IntegrationException error) {
        return ResponseEntity.status(error.getStatus()).header("Cache-Control", "no-store")
            .body(new ApiResponse<>(false, error.getMessage(), error.getData()));
    }
    @ExceptionHandler(InternalAuthenticationServiceException.class)
    public ResponseEntity<ApiResponse<Void>> authenticationInfrastructure(InternalAuthenticationServiceException error) {
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "Internal server error");
    }
    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ApiResponse<Void>> authentication(AuthenticationException error) {
        return error(HttpStatus.UNAUTHORIZED, "Invalid username or password");
    }
    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class,
        ConstraintViolationException.class, org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class})
    public ResponseEntity<ApiResponse<Void>> validation(Exception error) {
        return error(HttpStatus.BAD_REQUEST, "Invalid request");
    }
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Void>> forbidden(AccessDeniedException error) {
        return error(HttpStatus.FORBIDDEN, "Forbidden");
    }
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponse<Void>> notFound(NoResourceFoundException error) {
        return error(HttpStatus.NOT_FOUND, "Not found");
    }
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiResponse<Void>> methodNotAllowed(HttpRequestMethodNotSupportedException error) {
        return error(HttpStatus.METHOD_NOT_ALLOWED, "Method not allowed");
    }
    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ApiResponse<Void>> unsupportedMedia(HttpMediaTypeNotSupportedException error) {
        return error(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Unsupported media type");
    }
    @ExceptionHandler(HttpMediaTypeNotAcceptableException.class)
    public ResponseEntity<ApiResponse<Void>> unacceptableMedia(HttpMediaTypeNotAcceptableException error) {
        return error(HttpStatus.NOT_ACCEPTABLE, "Not acceptable");
    }
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> unexpected(Exception error) {
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "Internal server error");
    }
    private ResponseEntity<ApiResponse<Void>> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).header("Cache-Control", "no-store").body(ApiResponse.error(message));
    }
}
