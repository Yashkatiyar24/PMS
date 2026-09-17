package in.pms.users;

import in.pms.auth.CurrentUser;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/users")
public class UserAdminController {
    private final UserAdminService users;

    public UserAdminController(UserAdminService users) { this.users = users; }

    public record RoleInput(String role) {}
    public record PinInput(String pin) {}
    public record PasswordInput(String email, String password) {}

    @GetMapping @PreAuthorize("hasRole('MANAGER')")
    public List<UserAdminService.Member> members() { return users.members(); }

    @PostMapping @PreAuthorize("hasRole('OWNER')")
    public UserAdminService.Member invite(@AuthenticationPrincipal CurrentUser u, @RequestBody UserAdminService.InviteInput in) { return users.invite(in, u); }

    @PatchMapping("/{id}/role") @PreAuthorize("hasRole('OWNER')")
    public UserAdminService.Member setRole(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody RoleInput in) { return users.setRole(id, in.role(), u); }

    @DeleteMapping("/{id}") @PreAuthorize("hasRole('OWNER')")
    public ResponseEntity<Void> deactivate(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id) { users.deactivate(id, u); return ResponseEntity.noContent().build(); }

    @PostMapping("/{id}/pin") @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<Void> setPin(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody PinInput in) { users.setPin(id, in.pin(), u); return ResponseEntity.noContent().build(); }

    @PostMapping("/me/password") @PreAuthorize("hasRole('USER')")
    public ResponseEntity<Void> setPassword(@AuthenticationPrincipal CurrentUser u, @RequestBody PasswordInput in) { users.setPassword(in.email(), in.password(), u); return ResponseEntity.noContent().build(); }
}
