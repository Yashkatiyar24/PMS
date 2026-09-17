package in.pms.jobs;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.pms.messaging.MessageTemplates;
import in.pms.messaging.Outbox;
import in.pms.money.Money;
import in.pms.reports.ReportService;
import in.pms.settings.Settings;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Builds and queues the evening owner report (PRD Flow D, R1).
 *
 * <p>Separate from {@link DailyReportJob} on purpose: this is the work, the job is only the schedule.
 * The desk can also trigger it from the reports screen, and tests can call it without a scheduler.
 */
@Service
public class DailyReportService {
    private static final Logger log = LoggerFactory.getLogger(DailyReportService.class);

    private final ReportService reports;
    private final Outbox outbox;
    private final ObjectMapper json;
    private final JdbcClient jdbc;

    public DailyReportService(ReportService reports, Outbox outbox, ObjectMapper json, @Qualifier("jdbc") JdbcClient jdbc) {
        this.reports = reports; this.outbox = outbox; this.json = json; this.jdbc = jdbc;
    }

    /** Compute, store and queue the report. Safe to call twice: the outbox keys are idempotent. */
    @Transactional
    public Map<String, Object> send(JobRunner.PropertyRef property, LocalDate businessDate, Settings s) {
        Map<String, Object> report = reports.daily(businessDate);
        try {
            jdbc.sql("""
                    insert into daily_reports(property_id, business_date, payload) values (?, ?, ?::jsonb)
                    on conflict (property_id, business_date) do update set payload = excluded.payload""")
                    .params(property.id(), businessDate, json.writeValueAsString(report)).update();
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) { throw new IllegalStateException(e); }

        List<String> params = List.of(
                businessDate.toString(), property.name(),
                Money.format(((Number) report.get("collectedPaise")).longValue()),
                String.valueOf(report.get("arrivals")), String.valueOf(report.get("departures")),
                report.get("occupancyPct") + "%",
                Money.format(((Number) report.get("outstandingPaise")).longValue()));

        var recipients = jdbc.sql("""
                select u.phone, u.email from property_users pu join users u on u.id = pu.user_id
                where pu.property_id = ? and pu.active and pu.role in ('owner','manager') and u.active""")
                .param(property.id()).query().listOfRows();

        String key = "daily_report:" + property.id() + ":" + businessDate;
        String channel = s.reportChannel();
        for (var r : recipients) {
            String phone = r.get("phone") == null ? null : String.valueOf(r.get("phone"));
            String email = r.get("email") == null ? null : String.valueOf(r.get("email"));
            if (s.whatsappEnabled() && !"email".equals(channel) && phone != null)
                outbox.enqueue(property.id(), "whatsapp", Map.of("to", phone, "template", MessageTemplates.DAILY_SUMMARY_OWNER,
                        "language", s.guestLanguage(), "params", params), key + ":wa:" + phone);
            if (!"whatsapp".equals(channel) && email != null)
                outbox.enqueue(property.id(), "email", Map.of("to", email, "subject", property.name() + " — " + businessDate,
                        "html", "<pre>" + MessageTemplates.asText(MessageTemplates.DAILY_SUMMARY_OWNER, params) + "</pre>"), key + ":email:" + email);
        }
        jdbc.sql("update daily_reports set sent_at = now() where property_id = ? and business_date = ?").params(property.id(), businessDate).update();
        log.info("Daily report queued for {} ({})", property.name(), businessDate);
        return report;
    }
}
