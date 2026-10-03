package in.pms.selfreg;

import in.pms.common.PublicRateLimiter;
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
    /** Enough for a phone sending a field as it is typed and polling the desk's side every two seconds. */
    private static final int DRAFT_PER_MINUTE = 240;

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

    /**
     * The live session: what the shared draft now holds, including anything the desk corrected on its own
     * screen. This is the one endpoint that returns personal data to a caller with no account, and it returns
     * exactly one thing — the draft this token's own session is for. Still no guest record, no booking, no
     * room, no amount, and no full document number, because none of those can be written into a draft.
     *
     * <p>It is what lets a guest reload their phone mid-form without losing what they typed, and what carries
     * the desk's corrections back to them.
     */
    @GetMapping("/{token}/session")
    public ResponseEntity<SelfRegistrationService.Session> session(@PathVariable String token, HttpServletRequest req) {
        Resolved link = open(token, req, DRAFT_PER_MINUTE);
        return noStore(TenantContext.runAs(link.propertyId(), () -> {
            service.seen(link.id(), "opened");
            return service.session(link.id());
        }));
    }

    /**
     * One field the guest just filled, or what reading their ID suggests. Sent as it is typed (debounced on
     * the phone), so the desk watches the register fill in rather than waiting for a button.
     *
     * <p>A session the guest has already sent is closed to them: from then on only the desk may change it.
     */
    @PatchMapping("/{token}")
    public ResponseEntity<SelfRegistrationService.Session> patch(@PathVariable String token, HttpServletRequest req,
                                                                 @RequestBody SelfRegistrationService.Patch in) {
        Resolved link = open(token, req, DRAFT_PER_MINUTE);
        if (!"open".equals(link.state())) throw new in.pms.common.BadRequestException("These details have already been sent");
        return noStore(TenantContext.runAs(link.propertyId(), () -> {
            // "ocr" when the patch carries what a document read, so the desk's status line can say so and the
            // suggestion is labelled as the machine's guess rather than the guest's own words.
            service.writeDraft(link.id(), in, in != null && in.ocr() != null && !in.ocr().isEmpty() ? "ocr" : "guest", null);
            return service.session(link.id());
        }));
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
        return resolve(token);
    }

    /**
     * The draft channel gets an allowance of its own: a guest filling a form sends a field as they type and
     * asks for the desk's side every couple of seconds, which is far more requests than opening a form once —
     * but all of them against a token that is already known to be good.
     */
    private Resolved open(String token, HttpServletRequest req, int perMinute) {
        if (!limiter.allow("draft:" + req.getRemoteAddr(), perMinute))
            throw new ForbiddenException("Too many attempts; please wait a minute");
        return resolve(token);
    }

    private Resolved resolve(String token) {
        return service.resolve(token).orElseThrow(() -> new NotFoundException("This link has expired. Please ask the desk for a new one."));
    }

    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").body(body);
    }
}
