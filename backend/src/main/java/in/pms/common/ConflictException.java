package in.pms.common;

/** 409: the request is valid but conflicts with current state (double booking, duplicate number, ...). */
public class ConflictException extends RuntimeException {
    public ConflictException(String message) { super(message); }
}
