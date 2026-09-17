package in.pms.property;

import in.pms.auth.CurrentUser;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/property")
@PreAuthorize("hasRole('STAFF')")
public class PropertyController {
    private final PropertyService property;

    public PropertyController(PropertyService property) { this.property = property; }

    @GetMapping
    public PropertyService.Property current() { return property.current(); }

    @PutMapping @PreAuthorize("hasRole('MANAGER')")
    public PropertyService.Property update(@AuthenticationPrincipal CurrentUser u, @RequestBody PropertyService.PropertyInput in) { return property.update(in, u.id()); }
}
