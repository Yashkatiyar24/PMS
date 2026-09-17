package in.pms.tenant;

import org.springframework.jdbc.datasource.ConnectionHolder;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import javax.sql.DataSource;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.UUID;

/**
 * Begins every tenant transaction by setting {@code app.property_id} for Row Level Security.
 *
 * <p>{@code set_config(..., true)} is transaction-local, so it never leaks between pooled connections
 * (this is what makes PgBouncer transaction pooling safe).
 *
 * <p>Order matters: the tenant is checked <em>before</em> a connection is obtained. If the check ran after,
 * a refused transaction would leave a bound, tenant-less connection on the thread for the next caller to join.
 */
public class TenantTransactionManager extends DataSourceTransactionManager {

    public TenantTransactionManager(DataSource dataSource) { super(dataSource); }

    @Override
    protected void doBegin(Object transaction, TransactionDefinition definition) {
        UUID tenant = TenantContext.current()
                .orElseThrow(() -> new IllegalStateException("Tenant transaction started without a tenant in context"));
        TenantDataSource.starting(() -> { super.doBegin(transaction, definition); return null; });
        var holder = (ConnectionHolder) TransactionSynchronizationManager.getResource(obtainDataSource());
        try (PreparedStatement ps = holder.getConnection().prepareStatement("select set_config('app.property_id', ?, true)")) {
            ps.setString(1, tenant.toString());
            ps.execute();
        } catch (SQLException e) {
            doCleanupAfterCompletion(transaction);
            throw new CannotCreateTransactionException("Could not set tenant on connection", e);
        }
    }
}
