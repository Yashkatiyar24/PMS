package in.pms.common;

/** 403: the user is known but may not do this (role, edit window, approval missing). */
public class ForbiddenException extends RuntimeException {
    public ForbiddenException(String message) { super(message); }
}
