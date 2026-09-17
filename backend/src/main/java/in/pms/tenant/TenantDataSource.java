package in.pms.tenant;

import org.springframework.jdbc.datasource.DelegatingDataSource;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;

/**
 * Refuses to hand out a tenant connection outside a transaction.
 *
 * <p>Without this, forgetting {@code @Transactional} on a service method is a silent bug of the worst kind:
 * {@code app.property_id} is never set, so Row Level Security matches nothing, every query comes back empty,
 * and the screen says "not found". That reads as missing data rather than a mistake. Failing at the first
 * query turns it into an error a developer sees immediately.
 *
 * <p>One call is legitimately made before a transaction exists: {@link TenantTransactionManager} opening the
 * connection it is about to start the transaction on. It announces itself through {@link #starting}.
 */
public class TenantDataSource extends DelegatingDataSource {

    private static final ThreadLocal<Boolean> STARTING_TRANSACTION = ThreadLocal.withInitial(() -> false);

    public TenantDataSource(DataSource target) { super(target); }

    /** Run the transaction manager's own begin, during which a connection may be taken without a transaction. */
    static <T> T starting(java.util.function.Supplier<T> begin) {
        STARTING_TRANSACTION.set(true);
        try { return begin.get(); } finally { STARTING_TRANSACTION.remove(); }
    }

    @Override
    public Connection getConnection() throws SQLException {
        requireTransaction();
        return super.getConnection();
    }

    @Override
    public Connection getConnection(String username, String password) throws SQLException {
        requireTransaction();
        return super.getConnection(username, password);
    }

    private void requireTransaction() {
        if (STARTING_TRANSACTION.get() || TransactionSynchronizationManager.isActualTransactionActive()) return;
        throw new IllegalStateException(
                "Tenant database access outside a transaction: the tenant would not be set and Row Level Security "
                + "would hide every row. Annotate the service method with @Transactional.");
    }
}
