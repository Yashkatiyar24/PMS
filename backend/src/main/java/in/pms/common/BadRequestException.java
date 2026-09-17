package in.pms.common;

/** 400: the request itself is wrong in a way bean validation could not express. */
public class BadRequestException extends RuntimeException {
    public BadRequestException(String message) { super(message); }
}
