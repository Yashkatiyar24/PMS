package in.pms.selfreg;

import in.pms.common.ForbiddenException;
import in.pms.common.NotFoundException;
import in.pms.selfreg.SelfRegistrationService.Resolved;
import in.pms.tenant.TenantContext;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;

/**
 * The guest's own phone, with no account and no session. The token in the URL is the entire credential.
 *
 * <p>Everything here is written on the assumption that the caller is a stranger:
 * <ul>
 *   <li>An unknown, expired, revoked or already-used token all answer 404 alike, so probing cannot tell
 *       a real link from a guess.</li>
 *   <li>A GET returns the property's name and which fields to ask for. It never returns a guest, a booking,
 *       a room or an amount, so a token that leaks still discloses nothing about anybody.</li>
 *   <li>A POST stores what was typed and moves nothing else. Applying it to a guest record is a signed-in
 *       action at the desk.</li>
 *   <li>Responses carry {@code no-store} so the details do not sit in a shared phone's cache.</li>
 * </ul>
 *
 * <p>The token travels in the path, which is normal for a scan-to-open link but does mean it can reach
 * server access logs and browser history. That is why links are short-lived and single-use: treat a token
 * as public the moment it is shown on screen.
 */
@RestController
@RequestMapping("/api/public/registration")
public class PublicRegistrationController {
    private final SelfRegistrationService service;
    private final PublicRateLimiter limiter;

    public PublicRegistrationController(SelfRegistrationService service, PublicRateLimiter limiter) {
        this.service = service; this.limiter = limiter;
    }

    /** What the guest's phone needs to draw the form. */
    @GetMapping("/{token}")
    public ResponseEntity<SelfRegistrationService.GuestForm> form(@PathVariable String token, HttpServletRequest req) {
        Resolved link = open(token, req);
        return noStore(TenantContext.runAs(link.propertyId(), () -> service.form(link)));
    }

    @PostMapping("/{token}")
    public ResponseEntity<Map<String, String>> submit(@PathVariable String token, HttpServletRequest req,
                                                      @RequestBody SelfRegistration.Submission in) {
        Resolved link = open(token, req);
        TenantContext.runAs(link.propertyId(), () -> service.submit(link, in));
        return noStore(Map.of("status", "received"));
    }

    /** The guest photographing their own ID, before they send the form. */
    @PostMapping("/{token}/photo")
    public ResponseEntity<Map<String, String>> photo(@PathVariable String token, HttpServletRequest req,
                                                     @RequestParam("file") MultipartFile file) throws IOException {
        Resolved link = open(token, req);
        if (file.isEmpty()) throw new in.pms.common.BadRequestException("No photo was received");
        try (var stream = file.getInputStream()) {
            TenantContext.runAs(link.propertyId(),
                    () -> service.storePhoto(link, stream, file.getSize(), file.getContentType()));
        }
        return noStore(Map.of("status", "received"));
    }

    /**
     * Rate-limit, then resolve. A refused token is a 404 whatever the reason, so this method is the only
     * place that knows the difference.
     */
    private Resolved open(String token, HttpServletRequest req) {
        if (!limiter.allow(req.getRemoteAddr())) throw new ForbiddenException("Too many attempts; please wait a minute");
        return service.resolve(token).orElseThrow(() -> new NotFoundException("This link has expired. Please ask the desk for a new one."));
    }

    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").body(body);
    }
}
