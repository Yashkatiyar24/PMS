package in.pms.admin;

import in.pms.auth.CurrentUser;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Our back office. Reachable only by a super-admin; the whole path is gated in SecurityConfig as well as here,
 * because this is the one part of the API that crosses tenant boundaries.
 */
@RestController
@RequestMapping("/api/admin")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class AdminController {
    private final AdminService admin;

    public AdminController(AdminService admin) { this.admin = admin; }

    public record BillingInput(String billingStatus) {}
    public record PlanInput(String planCode) {}

    @GetMapping("/properties")
    public List<AdminService.PropertyHealth> properties() { return admin.properties(); }

    @PostMapping("/properties")
    public AdminService.NewPropertyResult create(@AuthenticationPrincipal CurrentUser user, @RequestBody AdminService.NewPropertyInput in) {
        return admin.createProperty(in, user);
    }

    @PatchMapping("/organisations/{id}/billing")
    public ResponseEntity<Void> billing(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID id, @RequestBody BillingInput in) {
        admin.setBillingStatus(id, in.billingStatus(), user);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/organisations/{id}/plan")
    public ResponseEntity<Void> plan(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID id, @RequestBody PlanInput in) {
        admin.setPlan(id, in.planCode(), user);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/properties/{id}/activity")
    public List<Map<String, Object>> activity(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID id) {
        return admin.recentActivity(id, user);
    }
}
