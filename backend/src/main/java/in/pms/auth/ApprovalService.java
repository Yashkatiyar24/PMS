package in.pms.auth;

import in.pms.common.ForbiddenException;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.UUID;

/**
 * Approval for exceptions (discounts, refunds, reductions, cancellations, credit notes).
 *
 * <p>Someone whose role holds the permission approves their own action. Anyone else needs a person who does
 * hold it to type their PIN on this device; that person's id is returned and stored on the audited change.
 */
@Service
public class ApprovalService {
    private final JdbcClient adminJdbc;
    private final PasswordService passwords;
    /** Wrong PINs per person asking: five in a rolling quarter of an hour. */
    private final Lockout wrong = new Lockout(5, Duration.ofMinutes(15));

    public ApprovalService(@Qualifier("adminJdbc") JdbcClient adminJdbc, PasswordService passwords) {
        this.adminJdbc = adminJdbc; this.passwords = passwords;
    }

    /** The manager-level approval every exception needed before roles had permissions: a discount's. */
    public UUID require(CurrentUser actor, UUID approverId, String pin) { return require(actor, Permissions.DISCOUNT, approverId, pin); }

    /**
     * @param actor      the user performing the action
     * @param permission what the action needs, e.g. {@link Permissions#REFUND}
     * @param approverId whose PIN is entered (may be null when the actor holds the permission)
     * @param pin        the PIN entered on the device
     * @return the user id to record as approver
     */
    public UUID require(CurrentUser actor, String permission, UUID approverId, String pin) {
        if (actor.can(permission)) return actor.id();
        if (pin == null || pin.isBlank()) throw new ForbiddenException("Manager approval required");
        String who = actor.id().toString();
        if (wrong.locked(who)) throw new ForbiddenException("Too many wrong PINs; try again in a few minutes");
        UUID property = TenantContext.require();
        var roles = Permissions.rolesWith(permission).toArray(String[]::new);
        // The desk screen has no approver picker: it sends its own id, or none, and the PIN says who approved.
        boolean named = approverId != null && !approverId.equals(actor.id());
        var approvers = adminJdbc.sql("""
                select user_id, approval_pin_hash from property_users
                where property_id = ? and active and approval_pin_hash is not null and role::text = any(?) and (? or user_id = ?)""")
                .params(property, roles, !named, approverId).query().listOfRows();
        for (var a : approvers)
            if (passwords.matches(pin, (String) a.get("approval_pin_hash"))) { wrong.clear(who); return (UUID) a.get("user_id"); }
        wrong.fail(who);
        throw new ForbiddenException("Wrong approval PIN");
    }
}
