package in.pms.booking;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * A stay: one guest (for a group, its leader), one or more units (rooms or dormitory beds), one folio.
 * A group is a stay with a group name, many units, and its members allocated to them; it is billed on one folio
 * and settled at one checkout, and a room can be released early when part of the group leaves.
 */
public record Booking(UUID id, UUID guestId, String guestName, String guestPhone, String state, String source,
                      OffsetDateTime arriveAt, OffsetDateTime departAt, OffsetDateTime checkedInAt, OffsetDateTime checkedOutAt,
                      int adults, int children, int memberCount, String purpose, String notes,
                      OffsetDateTime consentAt, boolean whatsappOptIn, OffsetDateTime flaggedNoshowAt, String cancelReason,
                      UUID folioId, long balanceDuePaise, List<Unit> units, List<Member> members, OffsetDateTime createdAt,
                      long totalPaise, long paidPaise, String paymentStatus, String specialRequests, String groupName,
                      String organization, String billingGstin, OffsetDateTime holdUntil) {

    public record Unit(UUID id, UUID roomId, String roomNumber, UUID bedId, String bedLabel, long ratePaise,
                       OffsetDateTime arriveAt, OffsetDateTime departAt, boolean autoAssigned) {
        public String label() { return bedLabel == null ? roomNumber : roomNumber + "/" + bedLabel; }
    }
    /** A member of the party, for the police register; {@code unitId} is the room or bed they sleep in. */
    public record Member(UUID id, String name, boolean adult, String idType, String idLast4, UUID unitId) {}

    /** Unpaid, partly paid or paid, from the bill: what the desk asks before anything else. */
    public static String paymentStatus(long totalPaise, long paidPaise, long balanceDuePaise) {
        if (paidPaise <= 0) return totalPaise <= 0 ? "paid" : "unpaid";
        return balanceDuePaise > 0 ? "partial" : "paid";
    }
}
