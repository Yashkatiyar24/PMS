package in.pms.guests;

import in.pms.auth.CurrentUser;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/guests")
@PreAuthorize("hasRole('STAFF')")
public class GuestController {
    private final GuestService guests;

    public GuestController(GuestService guests) { this.guests = guests; }

    @GetMapping @PreAuthorize("hasAuthority('PERM_reservations.view')")
    public List<Guest> search(@RequestParam(required = false) String phone, @RequestParam(required = false) String q) {
        return phone != null ? guests.lookupByPhone(phone) : guests.search(q);
    }

    @GetMapping("/{id}") @PreAuthorize("hasAuthority('PERM_reservations.view')")
    public Guest get(@PathVariable UUID id) { return guests.get(id); }

    @PostMapping
    public Guest create(@AuthenticationPrincipal CurrentUser u, @RequestBody GuestService.GuestInput in) { return guests.create(in, u.id()); }

    @PutMapping("/{id}")
    public Guest update(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody GuestService.GuestInput in) { return guests.update(id, in, u.id()); }

    @PostMapping(value = "/{id}/id-photo", consumes = "multipart/form-data")
    public Guest idPhoto(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestParam("file") MultipartFile file) throws IOException {
        return guests.storeIdPhoto(id, file.getInputStream(), file.getSize(), String.valueOf(file.getContentType()), u.id());
    }

    /** Identity documents are for the desk that checks guests in, not for everyone who can read a booking. */
    @GetMapping("/{id}/id-photo-url") @PreAuthorize("hasAuthority('PERM_checkin')")
    public Map<String, String> idPhotoUrl(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id) { return Map.of("url", guests.idPhotoUrl(id, u.id())); }

    /** Current stay, stay history, payments and what is still owed. */
    @GetMapping("/{id}/profile") @PreAuthorize("hasAuthority('PERM_reservations.view')")
    public GuestService.Profile profile(@PathVariable UUID id) { return guests.profile(id); }

    @PostMapping(value = "/{id}/photo", consumes = "multipart/form-data")
    public Guest photo(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestParam("file") MultipartFile file) throws IOException {
        return guests.storePhoto(id, file.getInputStream(), file.getSize(), String.valueOf(file.getContentType()), u.id());
    }

    @GetMapping("/{id}/photo-url") @PreAuthorize("hasAuthority('PERM_checkin')")
    public Map<String, String> photoUrl(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id) { return Map.of("url", guests.photoUrl(id, u.id())); }
}
