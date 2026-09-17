package in.pms.print;

import in.pms.auth.CurrentUser;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/**
 * Printing. The HTML endpoint is what the desk opens and prints from the browser (the fastest path on a
 * laptop); the PDF endpoint is what goes to a thermal print app or onto WhatsApp.
 */
@RestController
@RequestMapping("/api/receipts")
@PreAuthorize("hasRole('STAFF')")
public class PrintController {
    private final ReceiptRenderer renderer;

    public PrintController(ReceiptRenderer renderer) { this.renderer = renderer; }

    @GetMapping(value = "/{id}/html", produces = MediaType.TEXT_HTML_VALUE)
    public String html(@PathVariable UUID id, @RequestParam(required = false) String profile) { return renderer.html(id, profile); }

    @GetMapping(value = "/{id}/pdf", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> pdf(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestParam(required = false) String profile) {
        byte[] bytes = renderer.pdf(id, profile, u.id());
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"receipt.pdf\"").body(bytes);
    }
}
