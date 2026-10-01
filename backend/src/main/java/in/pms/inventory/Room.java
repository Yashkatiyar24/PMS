package in.pms.inventory;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * A room, its beds when it is a dormitory, and who is in it now.
 *
 * <p>{@code name}, {@code bedType} and {@code description} belong to this room alone. Its rate, occupancy and
 * amenities come from its room type, which is what the charge engine and the rate card read: a room is priced
 * by changing its type, not by carrying a price of its own.
 *
 * <p>{@code status} is housekeeping's word for the room (clean, dirty, cleaning, inspected, blocked,
 * maintenance). {@code occupancy} is the bookings' word: occupied, reserved for today, or null when free. For a
 * dormitory each bed carries its own occupancy; the room's is set only when the whole room is taken.
 */
public record Room(UUID id, UUID roomTypeId, String roomTypeName, String number, int floor, String status,
                   String blockedReason, OffsetDateTime blockedUntil, boolean active, List<Bed> beds,
                   String building, UUID housekeeperId, String housekeeperName, String hkPriority, String hkNote,
                   Occupancy occupancy, String name, String bedType, String description) {
    public record Bed(UUID id, String label, boolean active, Occupancy occupancy) {}
    public record Occupancy(String state, UUID bookingId, String guestName, OffsetDateTime departAt) {}
}
