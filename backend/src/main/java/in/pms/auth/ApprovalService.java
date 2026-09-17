package in.pms.auth;

import in.pms.common.ForbiddenException;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * Manager approval for exceptions (discounts, refunds, reductions, override checkout).
 * In {@code pin} mode a manager types their PIN on the staff device; the approver's id is returned and
 * stored on the audited change. A manager or owner acting for themselves needs no PIN.
 */
@Service
public class ApprovalService {
    private final JdbcClient adminJdbc;
    private final PasswordService passwords;

    public ApprovalService(@Qualifier("adminJdbc") JdbcClient adminJdbc, PasswordService passwords) {
        this.adminJdbc = adminJdbc; this.passwords = passwords;
    }

    /**
     * @param actor      the user performing the action
     * @param approverId manager whose PIN is entered (may be null when the actor is a manager)
     * @param pin        the PIN entered on the device
     * @return the user id to record as approver
     */
    public UUID require(CurrentUser actor, UUID approverId, String pin) {
        if (actor.hasRole(CurrentUser.Role.MANAGER)) return actor.id();
        if (approverId == null || pin == null) throw new ForbiddenException("Manager approval required");
        UUID property = TenantContext.require();
        var row = adminJdbc.sql("select approval_pin_hash from property_users where property_id = ? and user_id = ? and active and role in ('manager','owner')")
                .params(property, approverId).query(String.class).optional();
        if (row.isEmpty() || !passwords.matches(pin, row.get())) throw new ForbiddenException("Wrong approval PIN");
        return approverId;
    }
}
