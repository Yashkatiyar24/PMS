package in.pms.inventory;

import java.util.UUID;

public record RoomType(UUID id, String name, long baseRatePaise, int maxOccupancy, long extraPersonPaise,
                       boolean dormitory, int bedCount, int sortOrder, boolean active) {}
