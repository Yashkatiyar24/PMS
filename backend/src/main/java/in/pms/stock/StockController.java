package in.pms.stock;

import in.pms.auth.CurrentUser;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Supplies and linen. Named "inventory" in the address, as the desk calls it; rooms are the other inventory. */
@RestController
@RequestMapping("/api/inventory")
@PreAuthorize("hasAuthority('PERM_inventory')")
public class StockController {
    private final StockService stock;

    public StockController(StockService stock) { this.stock = stock; }

    @GetMapping("/items")
    public List<StockService.Item> items() { return stock.items(); }

    @PostMapping("/items")
    public StockService.Item create(@AuthenticationPrincipal CurrentUser u, @RequestBody StockService.ItemInput in) { return stock.createItem(in, u.id()); }

    @PutMapping("/items/{id}")
    public StockService.Item update(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody StockService.ItemInput in) { return stock.updateItem(id, in, u.id()); }

    @PostMapping("/items/{id}/movements")
    public StockService.Item move(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody StockService.MovementInput in) { return stock.move(id, in, u.id()); }

    @GetMapping("/items/{id}/movements")
    public List<StockService.Movement> movements(@PathVariable UUID id) { return stock.movements(id); }

    @GetMapping("/period")
    public List<StockService.PeriodRow> period(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                               @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) { return stock.period(from, to); }
}
