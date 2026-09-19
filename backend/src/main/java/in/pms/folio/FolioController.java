package in.pms.folio;

import in.pms.auth.ApprovalService;
import in.pms.auth.CurrentUser;
import in.pms.auth.Permissions;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/**
 * The bill. Reading it needs {@code reservations.view} (the desk, or an accountant); charging and taking money
 * is the desk's job. Reductions (discounts, removed charges), refunds and credit notes each need the matching
 * permission, or the PIN of someone who holds it.
 */
@RestController
@RequestMapping("/api/folios")
@PreAuthorize("hasRole('STAFF')")
public class FolioController {
    private final FolioService folios;
    private final ReceiptService receipts;
    private final ApprovalService approvals;
    private final in.pms.payments.PaymentService online;

    public FolioController(FolioService folios, ReceiptService receipts, ApprovalService approvals, in.pms.payments.PaymentService online) {
        this.folios = folios; this.receipts = receipts; this.approvals = approvals; this.online = online;
    }

    public record LineRequest(FolioService.LineInput line, UUID approverId, String pin) {}
    public record RemoveLineRequest(String reason, UUID approverId, String pin) {}
    public record RefundRequest(FolioService.PaymentInput payment, UUID approverId, String pin) {}
    public record CreditNoteRequest(long amountPaise, String reason, UUID approverId, String pin) {}

    @GetMapping("/{id}") @PreAuthorize("hasAuthority('PERM_reservations.view')")
    public Folio get(@PathVariable UUID id) { return folios.get(id); }

    @GetMapping("/by-booking/{bookingId}") @PreAuthorize("hasAuthority('PERM_reservations.view')")
    public Folio forBooking(@PathVariable UUID bookingId) { return folios.forBooking(bookingId); }

    /** Discounts and adjustments need approval; extras and deposits do not. */
    @PostMapping("/{id}/lines")
    public Folio addLine(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody LineRequest in) {
        boolean needsApproval = List.of("discount", "adjustment").contains(in.line().kind());
        UUID approver = needsApproval ? approvals.require(u, Permissions.DISCOUNT, in.approverId(), in.pin()) : null;
        return folios.addLine(id, in.line(), u.id(), approver);
    }

    @DeleteMapping("/{id}/lines/{lineId}")
    public Folio removeLine(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @PathVariable UUID lineId, @RequestBody RemoveLineRequest in) {
        return folios.removeLine(id, lineId, in.reason(), u.id(), approvals.require(u, Permissions.DISCOUNT, in.approverId(), in.pin()));
    }

    @PostMapping("/{id}/payments")
    public Folio pay(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody FolioService.PaymentInput in) { return folios.recordPayment(id, in, u.id()); }

    @PostMapping("/{id}/refunds") @PreAuthorize("hasRole('STAFF') or hasAuthority('PERM_refund')")
    public Folio refund(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody RefundRequest in) {
        UUID approver = approvals.require(u, Permissions.REFUND, in.approverId(), in.pin());
        // Money paid online goes back the way it came, through the gateway.
        if ("online".equals(in.payment().mode())) return online.refund(id, in.payment().amountPaise(), in.payment().reason(), u.id(), approver);
        return folios.refund(id, in.payment(), u.id(), approver);
    }

    @GetMapping("/{id}/receipts") @PreAuthorize("hasAuthority('PERM_reservations.view')")
    public List<ReceiptService.Receipt> receipts(@PathVariable UUID id) { return receipts.forFolio(id); }

    @PostMapping("/{id}/receipts/invoice") @PreAuthorize("hasRole('STAFF') or hasAuthority('PERM_invoice.edit')")
    public ReceiptService.Receipt invoice(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id) { return receipts.issueInvoice(id, u.id()); }

    @PostMapping("/{id}/receipts/provisional")
    public ReceiptService.Receipt provisional(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestParam long amountPaise) { return receipts.issueProvisional(id, amountPaise, u.id()); }

    @PostMapping("/receipts/{receiptId}/credit-note") @PreAuthorize("hasRole('STAFF') or hasAuthority('PERM_invoice.edit')")
    public ReceiptService.Receipt creditNote(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID receiptId, @RequestBody CreditNoteRequest in) {
        return receipts.creditNote(receiptId, in.amountPaise(), in.reason(), u.id(), approvals.require(u, Permissions.INVOICE_EDIT, in.approverId(), in.pin()));
    }
}
