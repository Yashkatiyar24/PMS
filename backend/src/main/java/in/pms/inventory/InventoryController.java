package in.pms.inventory;

import in.pms.auth.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api")
@PreAuthorize("hasRole('STAFF')")
public class InventoryController {
    private final InventoryService inventory;

    public InventoryController(InventoryService inventory) { this.inventory = inventory; }

    @GetMapping("/room-types")
    public List<RoomType> roomTypes() { return inventory.roomTypes(); }

    @PostMapping("/room-types") @PreAuthorize("hasRole('MANAGER')")
    public RoomType createRoomType(@AuthenticationPrincipal CurrentUser u, @RequestBody InventoryService.RoomTypeInput in) { return inventory.createRoomType(in, u.id()); }

    @PutMapping("/room-types/{id}") @PreAuthorize("hasRole('MANAGER')")
    public RoomType updateRoomType(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody InventoryService.RoomTypeInput in) { return inventory.updateRoomType(id, in, u.id()); }

    @GetMapping("/rooms")
    public List<Room> rooms() { return inventory.rooms(); }

    @GetMapping("/rooms/{id}")
    public Room room(@PathVariable UUID id) { return inventory.room(id); }

    @PostMapping("/rooms") @PreAuthorize("hasRole('MANAGER')")
    public Room createRoom(@AuthenticationPrincipal CurrentUser u, @RequestBody InventoryService.RoomInput in) { return inventory.createRoom(in, u.id()); }

    @PostMapping("/rooms/bulk") @PreAuthorize("hasRole('MANAGER')")
    public List<Room> createRooms(@AuthenticationPrincipal CurrentUser u, @RequestBody InventoryService.BulkRoomsInput in) { return inventory.createRooms(in, u.id()); }

    @PutMapping("/rooms/{id}") @PreAuthorize("hasRole('MANAGER')")
    public Room updateRoom(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody InventoryService.RoomInput in) { return inventory.updateRoom(id, in, u.id()); }

    public record StatusInput(@NotBlank String status, String reason, OffsetDateTime until) {}

    /** Staff may flip clean/dirty and block with a reason (H2). */
    @PatchMapping("/rooms/{id}/status")
    public Room setStatus(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody @Valid StatusInput in) { return inventory.setStatus(id, in.status(), in.reason(), in.until(), u.id()); }
}
