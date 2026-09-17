package in.pms.tax;

import in.pms.auth.CurrentUser;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/tax-rules")
@PreAuthorize("hasRole('MANAGER')")
public class TaxRuleController {
    private final TaxRuleService taxRules;

    public TaxRuleController(TaxRuleService taxRules) { this.taxRules = taxRules; }

    public record AddInput(LocalDate effectiveFrom, TaxRules rules) {}

    @GetMapping
    public List<TaxRuleService.TaxRuleView> list() { return taxRules.list(); }

    @GetMapping("/in-force")
    public TaxRules inForce(@RequestParam(required = false) LocalDate date) { return taxRules.inForce(date == null ? LocalDate.now() : date); }

    @PostMapping @PreAuthorize("hasRole('OWNER')")
    public TaxRuleService.TaxRuleView add(@AuthenticationPrincipal CurrentUser u, @RequestBody AddInput in) { return taxRules.add(in.effectiveFrom(), in.rules(), u.id()); }
}
