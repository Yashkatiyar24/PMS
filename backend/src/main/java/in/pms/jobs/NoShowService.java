package in.pms.jobs;

import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;

/**
 * Flags reservations that have not arrived by the property's {@code noshow_hour} (PRD Flow C).
 * Nothing is cancelled automatically: a pilgrim family arriving at midnight is normal, so the desk decides
 * whether it is really a no-show and what happens to the advance.
 */
@Service
public class NoShowService {
    private final JdbcClient jdbc;

    public NoShowService(@Qualifier("jdbc") JdbcClient jdbc) { this.jdbc = jdbc; }

    /** @return how many reservations were flagged. */
    @Transactional
    public int flag(LocalDate day, ZoneId zone) {
        return jdbc.sql("""
                update bookings set flagged_noshow_at = now(), updated_at = now()
                where property_id = ? and state = 'reserved' and flagged_noshow_at is null
                  and arrive_at >= ? and arrive_at < ?""")
                .params(TenantContext.require(), day.atStartOfDay(zone).toOffsetDateTime(), day.plusDays(1).atStartOfDay(zone).toOffsetDateTime())
                .update();
    }
}
