package in.pms.property;

import in.pms.auth.CurrentUser;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@RestController
@RequestMapping("/api/property")
@PreAuthorize("hasRole('STAFF')")
public class PropertyController {
    private final PropertyService property;

    public PropertyController(PropertyService property) { this.property = property; }

    @GetMapping @PreAuthorize("hasRole('LIMITED')")
    public PropertyService.Property current() { return property.current(); }

    @PutMapping @PreAuthorize("hasRole('MANAGER')")
    public PropertyService.Property update(@AuthenticationPrincipal CurrentUser u, @RequestBody PropertyService.PropertyInput in) { return property.update(in, u.id()); }

    /** The property's photograph, for its booking page. Managers and owners only: it is the property's public face. */
    @PostMapping(value = "/photo", consumes = "multipart/form-data") @PreAuthorize("hasRole('MANAGER')")
    public PropertyService.Property photo(@AuthenticationPrincipal CurrentUser u, @RequestParam("file") MultipartFile file) throws IOException {
        try (var data = file.getInputStream()) {
            return property.storePhoto(data, file.getSize(), String.valueOf(file.getContentType()), u.id());
        }
    }

    @DeleteMapping("/photo") @PreAuthorize("hasRole('MANAGER')")
    public PropertyService.Property removePhoto(@AuthenticationPrincipal CurrentUser u) { return property.removePhoto(u.id()); }
}
