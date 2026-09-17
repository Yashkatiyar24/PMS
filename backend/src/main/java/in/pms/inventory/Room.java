package in.pms.inventory;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record Room(UUID id, UUID roomTypeId, String roomTypeName, String number, int floor, String status,
                   String blockedReason, OffsetDateTime blockedUntil, boolean active, List<Bed> beds) {
    public record Bed(UUID id, String label, boolean active) {}
}
