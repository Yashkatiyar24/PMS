package in.pms.config;

import com.zaxxer.hikari.HikariDataSource;
import in.pms.tenant.TenantTransactionManager;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

import javax.sql.DataSource;

/**
 * Two connection pools, two transaction managers.
 *
 * <p>{@code tenantTx} (the default for {@code @Transactional}) connects as {@code pms_app}, which is subject
 * to Row Level Security, and sets {@code app.property_id} from {@link in.pms.tenant.TenantContext} at the start
 * of every transaction. A transaction without a tenant in context is refused.
 *
 * <p>{@code adminTx} connects as {@code pms_admin}, which bypasses RLS. It is used only by auth, session
 * management, platform administration and scheduled jobs, and only through {@code @Transactional("adminTx")}.
 *
 * <p>Every injection point names its bean with {@code @Qualifier}: with a primary datasource present, Spring would
 * otherwise inject the app pool by type into the admin beans, silently turning admin work into tenant work.
 */
@Configuration
@EnableTransactionManagement
public class DataSourceConfig {

    private static HikariDataSource pool(PmsProperties.Pool p, String name) {
        var ds = new HikariDataSource();
        ds.setJdbcUrl(p.url());
        ds.setUsername(p.username());
        ds.setPassword(p.password());
        ds.setMaximumPoolSize(p.maxPoolSize());
        ds.setPoolName(name);
        ds.setAutoCommit(false);
        return ds;
    }

    @Bean(name = "appDataSource") @Primary
    public DataSource appDataSource(PmsProperties props) { return pool(props.db().app(), "pms-app"); }

    @Bean(name = "adminDataSource")
    public DataSource adminDataSource(PmsProperties props) { return pool(props.db().admin(), "pms-admin"); }

    @Bean(name = "tenantTx") @Primary
    public PlatformTransactionManager tenantTx(@Qualifier("appDataSource") DataSource appDataSource) { return new TenantTransactionManager(appDataSource); }

    @Bean(name = "adminTx")
    public PlatformTransactionManager adminTx(@Qualifier("adminDataSource") DataSource adminDataSource) { return new DataSourceTransactionManager(adminDataSource); }

    /** Tenant-scoped JDBC access. Use inside {@code @Transactional} methods. */
    @Bean(name = "jdbc") @Primary
    public JdbcClient jdbc(@Qualifier("appDataSource") DataSource appDataSource) { return JdbcClient.create(appDataSource); }

    /** RLS-bypassing JDBC access. Use inside {@code @Transactional("adminTx")} methods only. */
    @Bean(name = "adminJdbc")
    public JdbcClient adminJdbc(@Qualifier("adminDataSource") DataSource adminDataSource) { return JdbcClient.create(adminDataSource); }
}
