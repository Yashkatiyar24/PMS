package in.pms.jobs;

import in.pms.settings.SettingsService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

/** Nightly schedule for ID photo retention. The work lives in {@link PhotoPurgeService}. */
@Component
@ConditionalOnProperty(name = "pms.jobs.enabled", havingValue = "true", matchIfMissing = true)
public class PhotoPurgeJob {
    private static final String JOB = "purge_photos";

    private final JobRunner runner;
    private final PhotoPurgeService purge;
    private final SettingsService settings;

    public PhotoPurgeJob(JobRunner runner, PhotoPurgeService purge, SettingsService settings) {
        this.runner = runner; this.purge = purge; this.settings = settings;
    }

    @Scheduled(cron = "0 30 3 * * *")
    public void tick() {
        runner.forEachProperty(JOB, p -> {
            LocalDate today = LocalDate.now(p.zone());
            if (!runner.claim(JOB, p.id() + ":" + today)) return;
            purge.purge(settings.current().idPhotoRetentionDays());
        });
    }
}
