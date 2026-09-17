package in.pms.jobs;

import in.pms.settings.SettingsService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.ZonedDateTime;

/** Schedule for no-show flagging. The work lives in {@link NoShowService}. */
@Component
@ConditionalOnProperty(name = "pms.jobs.enabled", havingValue = "true", matchIfMissing = true)
public class NoShowJob {
    private static final String JOB = "noshow_flag";

    private final JobRunner runner;
    private final NoShowService noShows;
    private final SettingsService settings;

    public NoShowJob(JobRunner runner, NoShowService noShows, SettingsService settings) {
        this.runner = runner; this.noShows = noShows; this.settings = settings;
    }

    @Scheduled(cron = "0 */15 * * * *")
    public void tick() {
        runner.forEachProperty(JOB, p -> {
            ZonedDateTime now = ZonedDateTime.now(p.zone());
            if (now.toLocalTime().isBefore(settings.current().noshowHour())) return;
            LocalDate today = now.toLocalDate();
            if (!runner.claim(JOB, p.id() + ":" + today)) return;
            noShows.flag(today, p.zone());
        });
    }
}
