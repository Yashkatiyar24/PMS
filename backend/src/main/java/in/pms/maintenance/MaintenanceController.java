package in.pms.maintenance;

import in.pms.auth.CurrentUser;
import in.pms.inventory.InventoryService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** Anyone on the floor can report a problem; the maintenance role works the tickets. Housekeeping keeps lost property. */
@RestController
@RequestMapping("/api")
public class MaintenanceController {
    private final MaintenanceService maintenance;

    public MaintenanceController(MaintenanceService maintenance) { this.maintenance = maintenance; }

    @GetMapping("/maintenance") @PreAuthorize("hasAnyAuthority('PERM_maintenance', 'PERM_maintenance.report')")
    public List<MaintenanceService.Ticket> list(@RequestParam(defaultValue = "false") boolean all) { return maintenance.list(all); }

    @PostMapping("/maintenance") @PreAuthorize("hasAuthority('PERM_maintenance.report')")
    public MaintenanceService.Ticket create(@AuthenticationPrincipal CurrentUser u, @RequestBody MaintenanceService.TicketInput in) { return maintenance.create(in, u.id()); }

    @PatchMapping("/maintenance/{id}") @PreAuthorize("hasAuthority('PERM_maintenance')")
    public MaintenanceService.Ticket update(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody MaintenanceService.TicketUpdate in) {
        return maintenance.update(id, in, u.id());
    }

    @GetMapping("/maintenance/technicians") @PreAuthorize("hasAuthority('PERM_maintenance')")
    public List<InventoryService.Person> technicians() { return maintenance.technicians(); }

    @GetMapping("/lost-found") @PreAuthorize("hasAuthority('PERM_housekeeping')")
    public List<MaintenanceService.Item> items() { return maintenance.items(); }

    @PostMapping("/lost-found") @PreAuthorize("hasAuthority('PERM_housekeeping')")
    public MaintenanceService.Item log(@AuthenticationPrincipal CurrentUser u, @RequestBody MaintenanceService.ItemInput in) { return maintenance.logItem(in, u.id()); }

    @PatchMapping("/lost-found/{id}") @PreAuthorize("hasAuthority('PERM_housekeeping')")
    public MaintenanceService.Item update(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody MaintenanceService.ItemUpdate in) {
        return maintenance.updateItem(id, in, u.id());
    }
}
