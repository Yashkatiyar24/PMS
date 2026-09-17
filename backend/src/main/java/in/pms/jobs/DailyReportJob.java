package in.pms.jobs;

import in.pms.settings.Settings;
import in.pms.settings.SettingsService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.ZonedDateTime;

/**
 * Schedule for the evening owner report. The work lives in {@link DailyReportService}.
 *
 * <p>Ticks every quarter hour and sends each property's report once its own {@code business_day_start} has
 * passed, in the property's timezone. The {@code job_runs} key is (property, business date), so a restart or
 * a second instance cannot send it twice.
 */
@Component
@ConditionalOnProperty(name = "pms.jobs.enabled", havingValue = "true", matchIfMissing = true)
public class DailyReportJob {
    private static final String JOB = "daily_report";

    private final JobRunner runner;
    private final DailyReportService dailyReports;
    private final SettingsService settings;

    public DailyReportJob(JobRunner runner, DailyReportService dailyReports, SettingsService settings) {
        this.runner = runner; this.dailyReports = dailyReports; this.settings = settings;
    }

    @Scheduled(cron = "0 */15 * * * *")
    public void tick() {
        runner.forEachProperty(JOB, p -> {
            Settings s = settings.current();
            ZonedDateTime now = ZonedDateTime.now(p.zone());
            if (now.toLocalTime().isBefore(s.businessDayStart())) return;   // the day is still open
            LocalDate businessDate = now.toLocalDate();
            if (!runner.claim(JOB, p.id() + ":" + businessDate)) return;    // already sent
            dailyReports.send(p, businessDate, s);
        });
    }
}
