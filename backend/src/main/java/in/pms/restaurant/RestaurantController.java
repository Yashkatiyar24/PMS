package in.pms.restaurant;

import in.pms.auth.CurrentUser;
import in.pms.money.Money;
import in.pms.settings.SettingsService;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/restaurant")
@PreAuthorize("hasAuthority('PERM_restaurant')")
public class RestaurantController {
    private final RestaurantService restaurant;
    private final TemplateEngine templates;
    private final SettingsService settings;
    private final JdbcClient jdbc;

    public RestaurantController(RestaurantService restaurant, TemplateEngine templates, SettingsService settings, @Qualifier("jdbc") JdbcClient jdbc) {
        this.restaurant = restaurant; this.templates = templates; this.settings = settings; this.jdbc = jdbc;
    }

    public record LinesInput(List<RestaurantService.LineInput> lines) {}
    public record PostInput(UUID bookingId) {}
    public record PayInput(String mode, String reference) {}
    public record CancelInput(String reason) {}

    @GetMapping("/menu")
    public List<RestaurantService.MenuItem> menu() { return restaurant.menu(); }

    @PostMapping("/menu") @PreAuthorize("hasRole('MANAGER')")
    public RestaurantService.MenuItem addMenuItem(@AuthenticationPrincipal CurrentUser u, @RequestBody RestaurantService.MenuInput in) { return restaurant.saveMenuItem(null, in, u.id()); }

    @PutMapping("/menu/{id}") @PreAuthorize("hasRole('MANAGER')")
    public RestaurantService.MenuItem updateMenuItem(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody RestaurantService.MenuInput in) { return restaurant.saveMenuItem(id, in, u.id()); }

    /** Open orders, and with {@code all} the ones settled since yesterday. */
    @GetMapping("/orders")
    public List<RestaurantService.Order> orders(@RequestParam(defaultValue = "false") boolean all) { return restaurant.orders(!all); }

    @PostMapping("/orders")
    public RestaurantService.Order create(@AuthenticationPrincipal CurrentUser u, @RequestBody RestaurantService.OrderInput in) { return restaurant.create(in, u.id()); }

    @PutMapping("/orders/{id}/lines")
    public RestaurantService.Order lines(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody LinesInput in) { return restaurant.setLines(id, in.lines(), u.id()); }

    @PostMapping("/orders/{id}/post")
    public RestaurantService.Order post(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody(required = false) PostInput in) {
        return restaurant.postToRoom(id, in == null ? null : in.bookingId(), u.id());
    }

    @PostMapping("/orders/{id}/pay")
    public RestaurantService.Order pay(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody PayInput in) { return restaurant.pay(id, in.mode(), in.reference(), u.id()); }

    @PostMapping("/orders/{id}/cancel")
    public RestaurantService.Order cancel(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody CancelInput in) { return restaurant.cancel(id, in.reason(), u.id()); }

    /** The bill to print or hand over: the property's header, what was ordered, the GST, the total. */
    @GetMapping(value = "/orders/{id}/bill", produces = MediaType.TEXT_HTML_VALUE)
    @Transactional(readOnly = true)
    public String bill(@PathVariable UUID id) {
        var order = restaurant.get(id);
        var property = jdbc.sql("select name, address, city, phone, gstin, timezone from properties where id = ?").param(TenantContext.require()).query().singleRow();
        ZoneId zone = ZoneId.of(String.valueOf(property.get("timezone")));
        Context ctx = new Context();
        ctx.setVariable("property", property);
        ctx.setVariable("order", order);
        ctx.setVariable("when", DateTimeFormatter.ofPattern("dd-MM-yyyy HH:mm").format(order.createdAt().atZoneSameInstant(zone)));
        ctx.setVariable("lines", order.lines().stream().map(l -> Map.of("name", l.name(), "qty", l.qty(), "rate", Money.format(l.unitPaise()), "amount", Money.format(l.unitPaise() * l.qty()))).toList());
        ctx.setVariable("taxable", Money.format(order.taxablePaise()));
        ctx.setVariable("rate", order.taxRateBp() / 100.0 + "%");
        ctx.setVariable("cgst", Money.format(order.cgstPaise()));
        ctx.setVariable("sgst", Money.format(order.sgstPaise()));
        ctx.setVariable("total", Money.format(order.totalPaise()));
        ctx.setVariable("footer", settings.current().receiptFooter());
        return templates.process("pos_bill", ctx);
    }
}
