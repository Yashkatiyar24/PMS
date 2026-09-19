package in.pms.portfolio;

import in.pms.auth.CurrentUser;
import in.pms.auth.Permissions;
import in.pms.booking.BookingService;
import in.pms.reports.ReportService;
import in.pms.tenant.TenantContext;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Every property the user may see the money of, side by side: tonight's occupancy, today's collection, who is in
 * and what is owed. Each figure is computed inside that property's own tenant, one at a time, and only for the
 * properties in the user's own memberships, so this can never reach a property they do not belong to.
 */
@RestController
@RequestMapping("/api/portfolio")
@PreAuthorize("hasRole('USER')")
public class PortfolioController {
    private final ReportService reports;
    private final BookingService bookings;

    public PortfolioController(ReportService reports, BookingService bookings) { this.reports = reports; this.bookings = bookings; }

    @GetMapping
    public List<Map<String, Object>> portfolio(@AuthenticationPrincipal CurrentUser u) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (CurrentUser.Membership m : u.memberships()) {
            if (!Permissions.of(m.position()).contains(Permissions.REVENUE_VIEW)) continue;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("propertyId", m.propertyId());
            row.put("propertyName", m.propertyName());
            row.put("current", m.propertyId().equals(u.propertyId()));
            TenantContext.runAs(m.propertyId(), () -> {
                Map<String, Object> day = reports.daily(null);
                Map<String, Object> today = bookings.today();
                row.put("occupancyPct", day.get("occupancyPct"));
                row.put("collectedPaise", day.get("collectedPaise"));
                row.put("outstandingPaise", day.get("outstandingPaise"));
                row.put("inHouse", ((List<?>) today.get("inHouse")).size());
                row.put("arrivals", ((List<?>) today.get("arrivals")).size());
                row.put("departures", ((List<?>) today.get("departures")).size());
                row.put("totalUnits", today.get("totalUnits"));
                row.put("bookedUnits", today.get("bookedUnits"));
            });
            out.add(row);
        }
        return out;
    }
}
