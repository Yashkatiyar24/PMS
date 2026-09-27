package in.pms.common;

import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.LinkedHashMap;
import java.util.Map;

/** One JSON error shape for the frontend: {@code {"error": "...", "fields": {...}}}. Never leaks internals. */
@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    public record ApiError(String error, Map<String, String> fields) {}

    @ExceptionHandler(NotFoundException.class)
    ResponseEntity<ApiError> notFound(NotFoundException e) { return body(HttpStatus.NOT_FOUND, e.getMessage()); }

    @ExceptionHandler(ConflictException.class)
    ResponseEntity<ApiError> conflict(ConflictException e) { return body(HttpStatus.CONFLICT, e.getMessage()); }

    @ExceptionHandler({ForbiddenException.class, AccessDeniedException.class})
    ResponseEntity<ApiError> forbidden(RuntimeException e) { return body(HttpStatus.FORBIDDEN, e.getMessage()); }

    @ExceptionHandler(BadRequestException.class)
    ResponseEntity<ApiError> badRequest(BadRequestException e) { return body(HttpStatus.BAD_REQUEST, e.getMessage()); }

    /** Thrown by libraries as much as by us, with messages written for developers; the client gets a fixed one. */
    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<ApiError> illegalArgument(IllegalArgumentException e) {
        log.warn("Invalid request: {}", e.getMessage());
        return body(HttpStatus.BAD_REQUEST, "Invalid request");
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> invalid(MethodArgumentNotValidException e) {
        Map<String, String> fields = new LinkedHashMap<>();
        e.getBindingResult().getFieldErrors().forEach(f -> fields.putIfAbsent(f.getField(), f.getDefaultMessage()));
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ApiError("Validation failed", fields));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<ApiError> invalid(ConstraintViolationException e) { return body(HttpStatus.BAD_REQUEST, "Validation failed"); }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ApiError> integrity(DataIntegrityViolationException e) {
        String msg = String.valueOf(e.getMostSpecificCause().getMessage());
        if (msg.contains("booking_units_no_overlap")) return body(HttpStatus.CONFLICT, "That room or bed is already taken for those dates");
        if (msg.contains("positive_stay")) return body(HttpStatus.BAD_REQUEST, "Departure must be after arrival");
        if (msg.contains("rooms_property_id_number_key")) return body(HttpStatus.CONFLICT, "A room with that number already exists");
        if (msg.contains("users_email_key")) return body(HttpStatus.CONFLICT, "That email already belongs to someone else");
        if (msg.contains("booking_units_room")) return body(HttpStatus.BAD_REQUEST, "That room or bed is not part of this property");
        // The constraint's name says what went wrong; the driver's message would also carry the values, e.g. a phone number.
        log.warn("Data integrity violation: {}", constraintOf(e));
        return body(HttpStatus.CONFLICT, "The change conflicts with existing data");
    }

    // The driver is runtime-scope on purpose (idiomatic Spring Boot: code talks to java.sql, not to org.postgresql),
    // so its exception class is not available here. The SQLState says what kind of violation it was (23505
    // unique, 23503 foreign key, 23514 check) without repeating the driver's message, which would carry the value.
    private static String constraintOf(DataIntegrityViolationException e) {
        Throwable cause = e.getMostSpecificCause();
        return cause instanceof java.sql.SQLException se && se.getSQLState() != null
                ? "sqlstate:" + se.getSQLState() : cause.getClass().getSimpleName();
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiError> other(Exception e) {
        log.error("Unhandled error", e);
        return body(HttpStatus.INTERNAL_SERVER_ERROR, "Something went wrong");
    }

    private static ResponseEntity<ApiError> body(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(new ApiError(message, null));
    }
}
