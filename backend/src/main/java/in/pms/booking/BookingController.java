package in.pms.booking;

import in.pms.auth.ApprovalService;
import in.pms.auth.CurrentUser;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * Booking endpoints. Actions that reduce a bill or override a rule accept {@code approverId} and {@code pin};
 * {@link ApprovalService} turns those into the approver recorded on the audited change.
 */
@RestController
@RequestMapping("/api/bookings")
@PreAuthorize("hasRole('STAFF')")
public class BookingController {
    private final BookingService bookings;
    private final ApprovalService approvals;

    public BookingController(BookingService bookings, ApprovalService approvals) { this.bookings = bookings; this.approvals = approvals; }

    public record Approval(UUID approverId, String pin) {}
    public record CheckOutInput(OffsetDateTime departAt, String overrideReason, UUID approverId, String pin) {}
    public record DatesInput(OffsetDateTime departAt, UUID approverId, String pin) {}
    public record ReasonInput(String reason, UUID approverId, String pin) {}
    public record ChangeUnitInput(BookingService.UnitRequest target) {}

    @GetMapping("/today")
    public Map<String, Object> today() { return bookings.today(); }

    @GetMapping("/tape-chart")
    public Map<String, Object> tapeChart(@RequestParam(required = false) LocalDate start, @RequestParam(required = false) Integer days) { return bookings.tapeChart(start, days); }

    @GetMapping("/{id}")
    public Booking get(@PathVariable UUID id) { return bookings.get(id); }

    @PostMapping("/check-in")
    public Booking checkIn(@AuthenticationPrincipal CurrentUser u, @RequestBody BookingService.CheckInRequest in) { return bookings.checkIn(in, u.id()); }

    @PostMapping("/reserve")
    public Booking reserve(@AuthenticationPrincipal CurrentUser u, @RequestBody BookingService.ReservationRequest in) { return bookings.reserve(in, u.id()); }

    @PostMapping("/{id}/arrive")
    public Booking arrive(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id) { return bookings.arrive(id, u.id()); }

    @PostMapping("/{id}/check-out")
    public Booking checkOut(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody(required = false) CheckOutInput in) {
        CheckOutInput i = in == null ? new CheckOutInput(null, null, null, null) : in;
        UUID approver = i.overrideReason() == null || i.overrideReason().isBlank() ? null : approvals.require(u, i.approverId(), i.pin());
        return bookings.checkOut(id, i.departAt(), i.overrideReason(), u.id(), approver);
    }

    @PatchMapping("/{id}/dates")
    public Booking changeDates(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody DatesInput in) {
        Booking current = bookings.get(id);
        UUID approver = in.departAt().isBefore(current.departAt()) ? approvals.require(u, in.approverId(), in.pin()) : null;
        return bookings.changeDates(id, in.departAt(), u.id(), approver);
    }

    @PatchMapping("/{id}/units/{unitId}")
    public Booking changeUnit(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @PathVariable UUID unitId, @RequestBody ChangeUnitInput in) {
        return bookings.changeUnit(id, unitId, in.target(), u.id());
    }

    @PostMapping("/{id}/cancel")
    public Booking cancel(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody ReasonInput in) {
        return bookings.cancel(id, in.reason(), u.id(), approvals.require(u, in.approverId(), in.pin()));
    }

    @PostMapping("/{id}/no-show")
    public Booking noShow(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody(required = false) Approval in) {
        Approval a = in == null ? new Approval(null, null) : in;
        return bookings.noShow(id, u.id(), approvals.require(u, a.approverId(), a.pin()));
    }
}
