package in.pms.stay;

import in.pms.common.ForbiddenException;
import in.pms.common.NotFoundException;
import in.pms.common.PublicRateLimiter;
import in.pms.stay.StayService.Resolved;
import in.pms.tenant.TenantContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The guest looking at their own stay, with no account and no session. The token in the URL is the entire
 * credential, and it names exactly one booking.
 *
 * <p>Read-only by design: there is no write on this path, so a leaked link can reveal one stay and change
 * nothing. An unknown, expired or revoked token all answer 404 alike, and responses carry {@code no-store}
 * so a bill does not sit in a shared phone's cache.
 */
@RestController
@RequestMapping("/api/public/stay")
public class PublicStayController {
    private final StayService service;
    private final PublicRateLimiter limiter;

    public PublicStayController(StayService service, PublicRateLimiter limiter) {
        this.service = service; this.limiter = limiter;
    }

    @GetMapping("/{token}")
    public ResponseEntity<StayService.StayView> stay(@PathVariable String token, HttpServletRequest req) {
        if (!limiter.allow(req.getRemoteAddr())) throw new ForbiddenException("Too many attempts; please wait a minute");
        Resolved link = service.resolve(token)
                .orElseThrow(() -> new NotFoundException("This link has expired. Please ask the desk for a new one."));
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(TenantContext.runAs(link.propertyId(), () -> service.view(link)));
    }
}
