package in.pms.jobs;

import in.pms.booking.BookingService;
import in.pms.payments.PaymentService;
import in.pms.settings.SettingsService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * The desk's small clock-driven chores, every five minutes: settle online payments the browser never reported,
 * let pending holds that ran out release their rooms,
 * and remind the desk (and opted-in guests) of checkouts coming up. The work lives in {@link BookingService};
 * each reminder is claimed once per stay and departure, so a restart or a second instance cannot repeat it.
 */
@Component
@ConditionalOnProperty(name = "pms.jobs.enabled", havingValue = "true", matchIfMissing = true)
public class FrontDeskJob {
    private static final String JOB = "front_desk";

    private final JobRunner runner;
    private final BookingService bookings;
    private final SettingsService settings;
    private final PaymentService payments;

    public FrontDeskJob(JobRunner runner, BookingService bookings, SettingsService settings, PaymentService payments) {
        this.runner = runner; this.bookings = bookings; this.settings = settings; this.payments = payments;
    }

    @Scheduled(cron = "15 */5 * * * *")
    public void tick() {
        runner.forEachProperty(JOB, p -> {
            // Ask the gateway first, so a guest who paid in the last minute keeps the room rather than losing it.
            payments.reconcileWaiting();
            bookings.expireHolds();
            int minutes = settings.current().checkoutReminderMinutes();
            if (minutes <= 0) return;
            for (var b : bookings.dueForCheckout(minutes))
                if (runner.claim("checkout_reminder", b.id() + ":" + b.departAt().toInstant())) bookings.remindCheckout(b.id());
        });
    }
}
