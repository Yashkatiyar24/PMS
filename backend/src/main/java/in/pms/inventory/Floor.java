package in.pms.inventory;

import java.util.UUID;

/**
 * A floor's label and where it sits in the list. The rooms on it are found by their own {@code floor} number,
 * not by a foreign key, so naming or un-naming a floor never touches a room, a booking or an availability
 * query. {@code rooms} is how many rooms are on it right now.
 */
public record Floor(UUID id, int number, String name, int sortOrder, int rooms) {}
