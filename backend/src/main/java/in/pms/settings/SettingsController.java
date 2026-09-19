package in.pms.settings;

import in.pms.auth.CurrentUser;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** The settings screen is generated from the registry; values are validated and audited by the service. */
@RestController
@RequestMapping("/api/settings")
@PreAuthorize("hasRole('STAFF')")
public class SettingsController {
    private final SettingsService settings;

    public SettingsController(SettingsService settings) { this.settings = settings; }

    public record RegistryView(List<SettingDef> definitions, Map<String, String> groups) {}

    /** Definitions, defaults and descriptions: what the UI renders. */
    @GetMapping("/registry") @PreAuthorize("hasRole('LIMITED')")
    public RegistryView registry() { return new RegistryView(SettingsRegistry.ALL, SettingsRegistry.GROUPS); }

    /** Resolved values for the current property (defaults merged in). */
    @GetMapping @PreAuthorize("hasRole('LIMITED')")
    public Map<String, Object> current() { return settings.current().asMap(); }

    /** Partial update; send {@code null} for a key to reset it to its default. */
    @PatchMapping
    @PreAuthorize("hasRole('MANAGER')")
    public Map<String, Object> update(@AuthenticationPrincipal CurrentUser user, @RequestBody Map<String, Object> patch) {
        var role = user.superAdmin() ? SettingDef.Role.SUPER_ADMIN : user.role() == CurrentUser.Role.OWNER ? SettingDef.Role.OWNER : SettingDef.Role.MANAGER;
        return settings.update(patch, role, user.id()).asMap();
    }
}
