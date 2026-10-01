package in.pms.inventory;

import in.pms.auth.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api")
@PreAuthorize("hasRole('STAFF')")
public class InventoryController {
    private static final String SEES_ROOMS = "hasRole('STAFF') or hasAnyAuthority('PERM_housekeeping', 'PERM_maintenance', 'PERM_reservations.view')";
    private final InventoryService inventory;

    public InventoryController(InventoryService inventory) { this.inventory = inventory; }

    @GetMapping("/room-types") @PreAuthorize(SEES_ROOMS)
    public List<RoomType> roomTypes() { return inventory.roomTypes(); }

    @PostMapping("/room-types") @PreAuthorize("hasRole('MANAGER')")
    public RoomType createRoomType(@AuthenticationPrincipal CurrentUser u, @RequestBody InventoryService.RoomTypeInput in) { return inventory.createRoomType(in, u.id()); }

    @PutMapping("/room-types/{id}") @PreAuthorize("hasRole('MANAGER')")
    public RoomType updateRoomType(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody InventoryService.RoomTypeInput in) { return inventory.updateRoomType(id, in, u.id()); }

    @GetMapping("/rooms") @PreAuthorize(SEES_ROOMS)
    public List<Room> rooms() { return inventory.rooms(); }

    @GetMapping("/floors") @PreAuthorize(SEES_ROOMS)
    public List<Floor> floors() { return inventory.floors(); }

    /** Name a floor, or add one before its rooms exist; a floor already there is renamed. */
    @PostMapping("/floors") @PreAuthorize("hasRole('MANAGER')")
    public Floor saveFloor(@AuthenticationPrincipal CurrentUser u, @RequestBody InventoryService.FloorInput in) { return inventory.saveFloor(in, u.id()); }

    /** Forget a floor's label. Refused while it still has rooms: those are moved or deactivated one by one. */
    @DeleteMapping("/floors/{number}") @PreAuthorize("hasRole('MANAGER')")
    public void deleteFloor(@AuthenticationPrincipal CurrentUser u, @PathVariable int number) { inventory.deleteFloor(number, u.id()); }

    /**
     * Lay out the rooms floor by floor. With {@code apply} false this is the preview the setup screen shows
     * before anything is created — same method, same answer, so there is nothing for the two to disagree about.
     */
    @PostMapping("/rooms/setup") @PreAuthorize("hasRole('MANAGER')")
    public InventoryService.SetupPlan setup(@AuthenticationPrincipal CurrentUser u, @RequestBody(required = false) InventoryService.SetupInput in) {
        return inventory.setup(in, u.id());
    }

    /** The default floor plan a new property opens with, for the setup screen to start from. */
    @GetMapping("/rooms/defaults") @PreAuthorize(SEES_ROOMS)
    public Map<String, Object> roomDefaults() {
        var d = inventory.defaults();
        return Map.of("roomsPerFloor", d.roomsPerFloor(), "firstFloor", d.firstFloor(), "totalRooms", d.defaultRoomCount(),
                "maxFloors", d.maxFloors(), "maxRoomsPerFloor", d.maxRoomsPerFloor());
    }

    /** What to call one more room on this floor. */
    @GetMapping("/rooms/next-number") @PreAuthorize("hasRole('MANAGER')")
    public Map<String, String> nextNumber(@RequestParam int floor) { return Map.of("number", inventory.nextNumber(floor)); }

    /** One change across the rooms the owner selected: their type, their floor, or taking them out of use. */
    @PostMapping("/rooms/bulk-update") @PreAuthorize("hasRole('MANAGER')")
    public List<Room> bulkUpdate(@AuthenticationPrincipal CurrentUser u, @RequestBody InventoryService.BulkUpdateInput in) { return inventory.bulkUpdate(in, u.id()); }

    @GetMapping("/rooms/{id}") @PreAuthorize(SEES_ROOMS)
    public Room room(@PathVariable UUID id) { return inventory.room(id); }

    @PostMapping("/rooms") @PreAuthorize("hasRole('MANAGER')")
    public Room createRoom(@AuthenticationPrincipal CurrentUser u, @RequestBody InventoryService.RoomInput in) { return inventory.createRoom(in, u.id()); }

    @PostMapping("/rooms/bulk") @PreAuthorize("hasRole('MANAGER')")
    public List<Room> createRooms(@AuthenticationPrincipal CurrentUser u, @RequestBody InventoryService.BulkRoomsInput in) { return inventory.createRooms(in, u.id()); }

    @PutMapping("/rooms/{id}") @PreAuthorize("hasRole('MANAGER')")
    public Room updateRoom(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody InventoryService.RoomInput in) { return inventory.updateRoom(id, in, u.id()); }

    public record StatusInput(@NotBlank String status, String reason, OffsetDateTime until) {}

    /** Housekeeping moves a room through the cleaning cycle in one tap, and takes it off sale with a reason (H2). */
    @PatchMapping("/rooms/{id}/status") @PreAuthorize("hasAnyAuthority('PERM_housekeeping', 'PERM_maintenance')")
    public Room setStatus(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody @Valid StatusInput in) { return inventory.setStatus(id, in.status(), in.reason(), in.until(), u.id()); }

    /** Who cleans it, how urgently, and a note for them. */
    @PatchMapping("/rooms/{id}/housekeeping") @PreAuthorize("hasAuthority('PERM_housekeeping')")
    public Room assign(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody InventoryService.HousekeepingInput in) { return inventory.assign(id, in, u.id()); }

    @GetMapping("/housekeepers") @PreAuthorize("hasAuthority('PERM_housekeeping')")
    public List<InventoryService.Person> housekeepers() { return inventory.housekeepers(); }

    public record BedInput(String label, Boolean active) {}

    @PostMapping("/rooms/{id}/beds") @PreAuthorize("hasRole('MANAGER')")
    public Room addBed(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody BedInput in) { return inventory.addBed(id, in.label(), u.id()); }

    @PatchMapping("/beds/{id}") @PreAuthorize("hasRole('MANAGER')")
    public Room setBed(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody BedInput in) { return inventory.setBedActive(id, !Boolean.FALSE.equals(in.active()), u.id()); }
}
