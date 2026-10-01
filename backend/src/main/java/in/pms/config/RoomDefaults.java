package in.pms.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * The floor plan a new property opens with, and how its rooms are numbered.
 *
 * <p>A property that cannot take a booking until someone has typed in eighty rooms is a property that does
 * not get used, so onboarding lays out a default building: by default three floors of 10, 10 and 5 rooms —
 * twenty-five rooms, numbered 101-110, 201-210, 301-305. Nothing in the code says twenty-five: the count is
 * whatever {@code rooms-per-floor} adds up to, and the owner changes the whole plan from the rooms screen
 * before or after any of it is used.
 *
 * <p>Configured under {@code pms.rooms} so a deployment serving, say, single-storey dharamshalas can ship a
 * different shape without a code change.
 */
@ConfigurationProperties(prefix = "pms.rooms")
public record RoomDefaults(List<Integer> roomsPerFloor, int firstFloor, int numberDigits,
                           String defaultTypeName, int defaultMaxOccupancy, int maxFloors, int maxRoomsPerFloor) {

    public RoomDefaults {
        if (roomsPerFloor == null || roomsPerFloor.isEmpty()) roomsPerFloor = List.of(10, 10, 5);
        if (firstFloor < 0) firstFloor = 1;
        if (numberDigits < 1) numberDigits = 2;
        if (defaultTypeName == null || defaultTypeName.isBlank()) defaultTypeName = "Standard";
        if (defaultMaxOccupancy < 1) defaultMaxOccupancy = 2;
        if (maxFloors < 1) maxFloors = 30;
        if (maxRoomsPerFloor < 1) maxRoomsPerFloor = 200;
    }

    /** How many rooms a brand-new property starts with: the sum of its default floors, not a number anywhere. */
    public int defaultRoomCount() { return roomsPerFloor.stream().mapToInt(Integer::intValue).sum(); }

    /** The default plan as floor-and-count pairs, floors numbered from {@link #firstFloor()} upward. */
    public List<int[]> defaultPlan() {
        return java.util.stream.IntStream.range(0, roomsPerFloor.size())
                .mapToObj(i -> new int[]{firstFloor + i, roomsPerFloor.get(i)}).toList();
    }

    /**
     * What the nth room on a floor is called: floor 2, room 3 → "203". A property that numbers its rooms some
     * other way renames them afterwards, or adds them by hand — both of which the rooms screen allows.
     */
    public String number(int floor, int n) {
        return floor + String.format("%0" + numberDigits + "d", n);
    }
}
