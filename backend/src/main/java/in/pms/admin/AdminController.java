package in.pms.admin;

import in.pms.auth.CurrentUser;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
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
    public record ModulesInput(List<String> modules) {}
    public record ActiveInput(boolean active) {}
    public record NotesInput(String notes) {}

    @GetMapping("/properties")
    public List<AdminService.PropertyHealth> properties() { return admin.properties(); }

    @GetMapping("/properties/{id}")
    public AdminService.PropertyHealth property(@PathVariable UUID id) { return admin.property(id); }

    @GetMapping("/properties/{id}/team")
    public List<AdminService.Member> team(@PathVariable UUID id) { return admin.team(id); }

    @GetMapping("/plans")
    public List<AdminService.Plan> plans() { return admin.plans(); }

    @PostMapping(value = "/properties/{id}/photo", consumes = "multipart/form-data")
    public AdminService.PropertyHealth photo(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID id, @RequestParam("file") MultipartFile file) throws IOException {
        try (var data = file.getInputStream()) {
            return admin.storePhoto(id, data, file.getSize(), String.valueOf(file.getContentType()), user);
        }
    }

    @PatchMapping("/properties/{id}/active")
    public AdminService.PropertyHealth active(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID id, @RequestBody ActiveInput in) {
        return admin.setActive(id, in.active(), user);
    }

    @PatchMapping("/properties/{id}/notes")
    public AdminService.PropertyHealth notes(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID id, @RequestBody NotesInput in) {
        return admin.setNotes(id, in.notes(), user);
    }

    @PostMapping("/properties/{id}/team/{userId}/password")
    public AdminService.NewPassword resetPassword(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID id, @PathVariable UUID userId) {
        return admin.resetPassword(id, userId, user);
    }

    @DeleteMapping("/properties/{id}/photo")
    public AdminService.PropertyHealth removePhoto(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID id) { return admin.removePhoto(id, user); }

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

    @PatchMapping("/properties/{id}/modules")
    public ResponseEntity<Void> modules(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID id, @RequestBody ModulesInput in) {
        admin.setModules(id, in.modules(), user);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/properties/{id}/activity")
    public List<Map<String, Object>> activity(@AuthenticationPrincipal CurrentUser user, @PathVariable UUID id) {
        return admin.recentActivity(id, user);
    }
}
