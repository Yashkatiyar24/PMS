package in.pms.folio;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * A booking's account. Totals are cached on the row and recomputed inside every write.
 * <pre>
 *   total        = charge lines (room, day-use, extra, discount, forfeit, adjustment) + their tax
 *   depositHeld  = deposit lines - deposit_refund lines
 *   paid         = all payments (refunds negative), including deposit money
 *   balanceDue   = total + depositHeld - paid
 * </pre>
 */
public record Folio(UUID id, UUID bookingId, String status, long totalPaise, long taxPaise, long paidPaise, long depositHeldPaise,
                    List<Line> lines, List<Payment> payments) {
    public long balanceDuePaise() { return totalPaise + depositHeldPaise - paidPaise; }

    public record Line(UUID id, String kind, String description, int qty, long unitPaise, int taxRateBp, long cgstPaise, long sgstPaise,
                       LocalDate lineDate, boolean auto, String reason, UUID approvedBy) {
        public long amountPaise() { return unitPaise * qty; }
        public long totalPaise() { return amountPaise() + cgstPaise + sgstPaise; }
    }
    public record Payment(UUID id, String mode, long amountPaise, String reference, boolean refund, String reason, OffsetDateTime receivedAt, UUID receivedBy, UUID approvedBy) {}
}
