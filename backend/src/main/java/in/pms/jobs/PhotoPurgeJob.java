package in.pms.jobs;

import in.pms.settings.SettingsService;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

/** Nightly retention: ID photos per property (the work lives in {@link PhotoPurgeService}), then the platform's own login tables. */
@Component
@ConditionalOnProperty(name = "pms.jobs.enabled", havingValue = "true", matchIfMissing = true)
public class PhotoPurgeJob {
    private static final String JOB = "purge_photos";

    private final JobRunner runner;
    private final PhotoPurgeService purge;
    private final SettingsService settings;
    private final JdbcClient adminJdbc;
    private final TransactionTemplate adminTx;

    public PhotoPurgeJob(JobRunner runner, PhotoPurgeService purge, SettingsService settings,
                         @Qualifier("adminJdbc") JdbcClient adminJdbc, @Qualifier("adminTx") PlatformTransactionManager adminTx) {
        this.runner = runner; this.purge = purge; this.settings = settings; this.adminJdbc = adminJdbc; this.adminTx = new TransactionTemplate(adminTx);
    }

    /** Spent codes and dead sessions are of no use to anyone and a smaller footprint if the database ever leaks. */
    @Scheduled(cron = "0 45 3 * * *")
    public void purgeLoginTables() {
        adminTx.executeWithoutResult(tx -> {
            adminJdbc.sql("delete from otp_codes where expires_at < now() - interval '1 day'").update();
            adminJdbc.sql("delete from sessions where coalesce(revoked_at, expires_at) < now() - interval '30 days'").update();
        });
    }

    @Scheduled(cron = "0 30 3 * * *")
    public void tick() {
        runner.forEachProperty(JOB, p -> {
            LocalDate today = LocalDate.now(p.zone());
            if (!runner.claim(JOB, p.id() + ":" + today)) return;
            int days = settings.current().idPhotoRetentionDays();
            purge.purge(days);
            purge.purgeRegistrations(days);
        });
    }
}
