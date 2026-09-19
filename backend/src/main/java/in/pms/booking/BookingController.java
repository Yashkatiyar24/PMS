package in.pms.booking;

import in.pms.auth.ApprovalService;
import in.pms.auth.CurrentUser;
import in.pms.auth.Permissions;
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
    /** A named rate is a price override, so it needs a discount's approval; without one the room's own rate applies. */
    public record ChangeUnitInput(BookingService.UnitRequest target, UUID approverId, String pin) {}

    @GetMapping("/today") @PreAuthorize("hasAuthority('PERM_reservations.view')")
    public Map<String, Object> today() { return bookings.today(); }

    @GetMapping("/tape-chart") @PreAuthorize("hasAuthority('PERM_reservations.view')")
    public Map<String, Object> tapeChart(@RequestParam(required = false) LocalDate start, @RequestParam(required = false) Integer days) { return bookings.tapeChart(start, days); }

    @GetMapping("/search") @PreAuthorize("hasAuthority('PERM_reservations.view')")
    public java.util.List<BookingService.SearchHit> search(@RequestParam String q) { return bookings.search(q); }

    @GetMapping("/{id}") @PreAuthorize("hasAuthority('PERM_reservations.view')")
    public Booking get(@PathVariable UUID id) { return bookings.get(id); }

    @GetMapping("/{id}/activity") @PreAuthorize("hasAuthority('PERM_reservations.view')")
    public java.util.List<BookingService.Activity> activity(@PathVariable UUID id) { return bookings.activity(id); }

    public record MoveInput(UUID unitId, UUID roomId, UUID bedId, LocalDate arriveOn) {}

    /** A bar dragged on the calendar. */
    @PostMapping("/{id}/move") @PreAuthorize("hasAuthority('PERM_reservations.edit')")
    public Booking move(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody MoveInput in) {
        return bookings.move(id, in.unitId(), in.roomId(), in.bedId(), in.arriveOn(), u.id());
    }

    @PostMapping("/check-in") @PreAuthorize("hasAuthority('PERM_checkin')")
    public Booking checkIn(@AuthenticationPrincipal CurrentUser u, @RequestBody BookingService.CheckInRequest in) { return bookings.checkIn(in, u.id()); }

    @PostMapping("/reserve") @PreAuthorize("hasAuthority('PERM_reservations.create')")
    public Booking reserve(@AuthenticationPrincipal CurrentUser u, @RequestBody BookingService.ReservationRequest in) { return bookings.reserve(in, u.id()); }

    @PostMapping("/{id}/arrive") @PreAuthorize("hasAuthority('PERM_checkin')")
    public Booking arrive(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id) { return bookings.arrive(id, u.id()); }

    @PostMapping("/{id}/check-out") @PreAuthorize("hasAuthority('PERM_checkout')")
    public Booking checkOut(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody(required = false) CheckOutInput in) {
        CheckOutInput i = in == null ? new CheckOutInput(null, null, null, null) : in;
        UUID approver = i.overrideReason() == null || i.overrideReason().isBlank() ? null : approvals.require(u, i.approverId(), i.pin());
        return bookings.checkOut(id, i.departAt(), i.overrideReason(), u.id(), approver);
    }

    @PatchMapping("/{id}/dates") @PreAuthorize("hasAuthority('PERM_reservations.edit')")
    public Booking changeDates(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody DatesInput in) {
        Booking current = bookings.get(id);
        UUID approver = in.departAt().isBefore(current.departAt()) ? approvals.require(u, in.approverId(), in.pin()) : null;
        return bookings.changeDates(id, in.departAt(), u.id(), approver);
    }

    @PatchMapping("/{id}/units/{unitId}") @PreAuthorize("hasAuthority('PERM_reservations.edit')")
    public Booking changeUnit(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @PathVariable UUID unitId, @RequestBody ChangeUnitInput in) {
        if (in.target() != null && in.target().ratePaise() != null) approvals.require(u, Permissions.DISCOUNT, in.approverId(), in.pin());
        return bookings.changeUnit(id, unitId, in.target(), u.id());
    }

    @PostMapping("/{id}/cancel") @PreAuthorize("hasAuthority('PERM_reservations.edit')")
    public Booking cancel(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody ReasonInput in) {
        return bookings.cancel(id, in.reason(), u.id(), approvals.require(u, Permissions.RESERVATIONS_CANCEL, in.approverId(), in.pin()));
    }

    /** A pending hold becomes a confirmed reservation. */
    @PostMapping("/{id}/confirm") @PreAuthorize("hasAuthority('PERM_reservations.edit')")
    public Booking confirm(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id) { return bookings.confirm(id, u.id()); }

    public record DetailsInput(BookingService.Details details, String notes) {}

    @PatchMapping("/{id}") @PreAuthorize("hasAuthority('PERM_reservations.edit')")
    public Booking details(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody DetailsInput in) {
        return bookings.updateDetails(id, in.details(), in.notes(), u.id());
    }

    /** Another room or bed for the stay's remaining nights. */
    @PostMapping("/{id}/units") @PreAuthorize("hasAuthority('PERM_reservations.edit')")
    public Booking addUnit(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody BookingService.UnitRequest in) {
        return bookings.addUnit(id, in, u.id());
    }

    /** Give one room back while the rest of the party stays. It lowers the bill, so it needs a discount's approval. */
    @PostMapping("/{id}/units/{unitId}/release") @PreAuthorize("hasAuthority('PERM_reservations.edit')")
    public Booking releaseUnit(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @PathVariable UUID unitId, @RequestBody(required = false) Approval in) {
        Approval a = in == null ? new Approval(null, null) : in;
        return bookings.releaseUnit(id, unitId, u.id(), approvals.require(u, Permissions.DISCOUNT, a.approverId(), a.pin()));
    }

    /** The party's names for the register, and who sleeps where. */
    @PutMapping("/{id}/members") @PreAuthorize("hasAuthority('PERM_reservations.edit')")
    public Booking members(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody java.util.List<Booking.Member> in) {
        return bookings.setMembers(id, in, u.id());
    }

    /** Rooms and beds free for a whole stay. Advisory: the database still decides when one is taken. */
    @GetMapping("/availability") @PreAuthorize("hasAuthority('PERM_reservations.view')")
    public java.util.List<BookingService.FreeUnit> availability(@RequestParam OffsetDateTime arrive, @RequestParam OffsetDateTime depart) {
        return bookings.availability(arrive, depart);
    }

    @PostMapping("/{id}/no-show") @PreAuthorize("hasAuthority('PERM_reservations.edit')")
    public Booking noShow(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody(required = false) Approval in) {
        Approval a = in == null ? new Approval(null, null) : in;
        return bookings.noShow(id, u.id(), approvals.require(u, Permissions.RESERVATIONS_CANCEL, a.approverId(), a.pin()));
    }
}
