package in.pms.common;

/** 404: the row does not exist in this tenant (which is also what RLS returns for another tenant's row). */
public class NotFoundException extends RuntimeException {
    public NotFoundException(String what) { super(what + " not found"); }
}
