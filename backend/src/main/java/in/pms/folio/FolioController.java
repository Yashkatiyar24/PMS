package in.pms.folio;

import in.pms.auth.ApprovalService;
import in.pms.auth.CurrentUser;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/folios")
@PreAuthorize("hasRole('STAFF')")
public class FolioController {
    private final FolioService folios;
    private final ReceiptService receipts;
    private final ApprovalService approvals;

    public FolioController(FolioService folios, ReceiptService receipts, ApprovalService approvals) {
        this.folios = folios; this.receipts = receipts; this.approvals = approvals;
    }

    public record LineRequest(FolioService.LineInput line, UUID approverId, String pin) {}
    public record RemoveLineRequest(String reason, UUID approverId, String pin) {}
    public record RefundRequest(FolioService.PaymentInput payment, UUID approverId, String pin) {}
    public record CreditNoteRequest(long amountPaise, String reason, UUID approverId, String pin) {}

    @GetMapping("/{id}")
    public Folio get(@PathVariable UUID id) { return folios.get(id); }

    @GetMapping("/by-booking/{bookingId}")
    public Folio forBooking(@PathVariable UUID bookingId) { return folios.forBooking(bookingId); }

    /** Discounts and adjustments need manager approval; extras and deposits do not. */
    @PostMapping("/{id}/lines")
    public Folio addLine(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody LineRequest in) {
        boolean needsApproval = List.of("discount", "adjustment").contains(in.line().kind());
        UUID approver = needsApproval ? approvals.require(u, in.approverId(), in.pin()) : null;
        return folios.addLine(id, in.line(), u.id(), approver);
    }

    @DeleteMapping("/{id}/lines/{lineId}")
    public Folio removeLine(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @PathVariable UUID lineId, @RequestBody RemoveLineRequest in) {
        return folios.removeLine(id, lineId, in.reason(), u.id(), approvals.require(u, in.approverId(), in.pin()));
    }

    @PostMapping("/{id}/payments")
    public Folio pay(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody FolioService.PaymentInput in) { return folios.recordPayment(id, in, u.id()); }

    @PostMapping("/{id}/refunds")
    public Folio refund(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody RefundRequest in) {
        return folios.refund(id, in.payment(), u.id(), approvals.require(u, in.approverId(), in.pin()));
    }

    @GetMapping("/{id}/receipts")
    public List<ReceiptService.Receipt> receipts(@PathVariable UUID id) { return receipts.forFolio(id); }

    @PostMapping("/{id}/receipts/invoice")
    public ReceiptService.Receipt invoice(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id) { return receipts.issueInvoice(id, u.id()); }

    @PostMapping("/{id}/receipts/provisional")
    public ReceiptService.Receipt provisional(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestParam long amountPaise) { return receipts.issueProvisional(id, amountPaise, u.id()); }

    @PostMapping("/receipts/{receiptId}/credit-note")
    public ReceiptService.Receipt creditNote(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID receiptId, @RequestBody CreditNoteRequest in) {
        return receipts.creditNote(receiptId, in.amountPaise(), in.reason(), u.id(), approvals.require(u, in.approverId(), in.pin()));
    }
}
