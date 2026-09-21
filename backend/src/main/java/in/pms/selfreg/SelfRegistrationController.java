package in.pms.selfreg;

import in.pms.auth.CurrentUser;
import in.pms.guests.GuestService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/** The desk's side of guest self-registration: make a link, watch for the answer, use it or throw it away. */
@RestController
@RequestMapping("/api/registrations")
@PreAuthorize("hasRole('STAFF')")
public class SelfRegistrationController {
    private final SelfRegistrationService service;

    public SelfRegistrationController(SelfRegistrationService service) { this.service = service; }

    public record CreateInput(UUID bookingId) {}

    @PostMapping
    public SelfRegistrationService.NewLink create(@AuthenticationPrincipal CurrentUser u, @RequestBody(required = false) CreateInput in) {
        return service.create(in == null ? null : in.bookingId(), u.id());
    }

    /** Polled by the desk while the QR is on screen. */
    @GetMapping("/{id}")
    public SelfRegistration get(@PathVariable UUID id) { return service.get(id); }

    /** The body, when present, is the desk's corrected copy of the details; an empty body keeps the guest's own words. */
    @PostMapping("/{id}/apply")
    public Map<String, UUID> apply(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id,
                                   @RequestBody(required = false) GuestService.GuestInput corrected) {
        return Map.of("guestId", service.apply(id, corrected, u.id()));
    }

    @PostMapping("/{id}/revoke")
    public SelfRegistration revoke(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id) {
        return service.revoke(id, u.id());
    }
}
