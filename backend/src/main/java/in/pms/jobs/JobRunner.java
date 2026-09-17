package in.pms.jobs;

import in.pms.tenant.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

/**
 * Helper for per-property scheduled work.
 *
 * <p>Two things every job needs and must not get wrong: each property runs inside its own tenant context
 * (so a job cannot touch another property's rows), and each unit of work records a {@code job_runs} key so a
 * restart or a second instance cannot repeat it.
 */
@Component
public class JobRunner {
    private static final Logger log = LoggerFactory.getLogger(JobRunner.class);
    private final JdbcClient admin;

    public JobRunner(@Qualifier("adminJdbc") JdbcClient admin) { this.admin = admin; }

    public record PropertyRef(UUID id, String name, ZoneId zone) {}

    @Transactional(value = "adminTx", readOnly = true)
    public List<PropertyRef> activeProperties() {
        return admin.sql("select id, name, timezone from properties where active order by name")
                .query((rs, i) -> new PropertyRef(rs.getObject("id", UUID.class), rs.getString("name"), ZoneId.of(rs.getString("timezone")))).list();
    }

    /** Run {@code body} for every active property, isolating failures so one property cannot stop the rest. */
    public void forEachProperty(String jobName, Consumer<PropertyRef> body) {
        for (PropertyRef p : activeProperties()) {
            try {
                TenantContext.runAs(p.id(), () -> body.accept(p));
            } catch (Exception e) {
                log.error("Job {} failed for property {}", jobName, p.id(), e);
            }
        }
    }

    /** @return true if this key has not run before (and is now claimed). */
    @Transactional("adminTx")
    public boolean claim(String jobName, String key) {
        return admin.sql("insert into job_runs(name, key) values (?, ?) on conflict (name, key) do nothing").params(jobName, key).update() == 1;
    }
}
