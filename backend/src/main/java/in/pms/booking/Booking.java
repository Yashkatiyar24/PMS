package in.pms.booking;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** A stay: one guest, one or more units (rooms or dormitory beds), one folio. */
public record Booking(UUID id, UUID guestId, String guestName, String guestPhone, String state, String source,
                      OffsetDateTime arriveAt, OffsetDateTime departAt, OffsetDateTime checkedInAt, OffsetDateTime checkedOutAt,
                      int adults, int children, int memberCount, String purpose, String notes,
                      OffsetDateTime consentAt, boolean whatsappOptIn, OffsetDateTime flaggedNoshowAt, String cancelReason,
                      UUID folioId, long balanceDuePaise, List<Unit> units, List<Member> members) {

    public record Unit(UUID id, UUID roomId, String roomNumber, UUID bedId, String bedLabel, long ratePaise,
                       OffsetDateTime arriveAt, OffsetDateTime departAt, boolean autoAssigned) {
        public String label() { return bedLabel == null ? roomNumber : roomNumber + "/" + bedLabel; }
    }
    public record Member(UUID id, String name, boolean adult, String idType, String idLast4) {}
}
