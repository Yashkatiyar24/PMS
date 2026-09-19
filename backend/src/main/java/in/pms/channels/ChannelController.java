package in.pms.channels;

import in.pms.auth.CurrentUser;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/** The owner's side of selling online: OTA calendar links per room, and the booking page's address. */
@RestController
@RequestMapping("/api/channels")
@PreAuthorize("hasRole('MANAGER')")
public class ChannelController {
    private final ChannelService channels;
    private final ChannelSync sync;

    public ChannelController(ChannelService channels, ChannelSync sync) {
        this.channels = channels; this.sync = sync;
    }

    public record LinkInput(UUID roomId, String channel, String importUrl) {}

    @GetMapping
    public ChannelService.Overview overview() { return channels.overview(); }

    @PostMapping("/links")
    public ChannelService.Link create(@AuthenticationPrincipal CurrentUser u, @RequestBody LinkInput in) {
        ChannelService.Link link = channels.create(in.roomId(), in.channel(), in.importUrl(), u.id());
        if (link.importUrl() != null) sync.sync(link.id());
        return channels.link(link.id());
    }

    @PatchMapping("/links/{id}")
    public ChannelService.Link setImportUrl(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody LinkInput in) {
        ChannelService.Link link = channels.setImportUrl(id, in.importUrl(), u.id());
        if (link.importUrl() != null) sync.sync(id);
        return channels.link(id);
    }

    @PostMapping("/links/{id}/rotate")
    public ChannelService.Link rotate(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id) { return channels.rotate(id, u.id()); }

    @PostMapping("/links/{id}/sync")
    public ChannelService.Link syncNow(@PathVariable UUID id) {
        sync.sync(id);
        return channels.link(id);
    }

    @DeleteMapping("/links/{id}")
    public void delete(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id) { channels.delete(id, u.id()); }

    @PostMapping("/booking-page")
    public Map<String, String> bookingPage(@AuthenticationPrincipal CurrentUser u) { return Map.of("slug", channels.ensureBookingSlug(u.id())); }
}
