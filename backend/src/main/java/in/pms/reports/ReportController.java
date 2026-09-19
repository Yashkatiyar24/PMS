package in.pms.reports;

import in.pms.auth.CurrentUser;
import in.pms.jobs.DailyReportService;
import in.pms.jobs.JobRunner;
import in.pms.settings.SettingsService;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/reports")
@PreAuthorize("hasRole('STAFF')")
public class ReportController {
    private final ReportService reports;
    private final DailyReportService dailyReports;
    private final SettingsService settings;
    private final JdbcClient jdbc;
    private final PeriodReportService period;

    public ReportController(ReportService reports, DailyReportService dailyReports, SettingsService settings, @Qualifier("jdbc") JdbcClient jdbc, PeriodReportService period) {
        this.reports = reports; this.dailyReports = dailyReports; this.settings = settings; this.jdbc = jdbc; this.period = period;
    }

    /** Every report over a range of days: occupancy, ADR, RevPAR, revenue, GST, bookings, sources, payments, expenses, housekeeping, maintenance, guests. */
    @GetMapping("/period") @PreAuthorize("hasAuthority('PERM_revenue.view')")
    public Map<String, Object> period(@RequestParam LocalDate from, @RequestParam LocalDate to) { return period.report(from, to); }

    /** The same, flattened to section,item,value rows for a spreadsheet. */
    @GetMapping(value = "/period.csv", produces = "text/csv") @PreAuthorize("hasAuthority('PERM_revenue.view')")
    @SuppressWarnings("unchecked")
    public ResponseEntity<byte[]> periodCsv(@RequestParam LocalDate from, @RequestParam LocalDate to) {
        Map<String, Object> data = period.report(from, to);
        StringBuilder csv = new StringBuilder("section,item,field,value\n");
        for (var section : data.entrySet()) flatten(csv, section.getKey(), "", section.getValue());
        return csvResponse(csv.toString(), "report-" + from + "-to-" + to + ".csv");
    }

    @SuppressWarnings("unchecked")
    private static void flatten(StringBuilder csv, String section, String item, Object value) {
        if (value instanceof Map<?, ?> m) {
            // A row of a list (it has a name-like first column) keeps that as the item; a plain group spreads its fields.
            for (var e : ((Map<String, Object>) m).entrySet()) {
                if (e.getValue() instanceof Map<?, ?> || e.getValue() instanceof List<?>) flatten(csv, section, e.getKey(), e.getValue());
                else csv.append(quote(section)).append(',').append(quote(item)).append(',').append(quote(e.getKey())).append(',').append(quote(str(e.getValue()))).append('\n');
            }
        } else if (value instanceof List<?> list) {
            for (Object row : list) {
                String name = row instanceof Map<?, ?> r ? str(r.values().iterator().next()) : "";
                flatten(csv, section, item.isEmpty() ? name : item + ":" + name, row);
            }
        } else {
            csv.append(quote(section)).append(',').append(quote(item)).append(",,").append(quote(str(value))).append('\n');
        }
    }

    public record HandoverInput(UUID userId, String notes) {}

    @GetMapping("/daily") @PreAuthorize("hasAuthority('PERM_revenue.view')")
    public Map<String, Object> daily(@RequestParam(required = false) LocalDate date) { return reports.daily(date); }

    /** Send the evening report now, for the desk or for testing; the job's idempotency key still applies. */
    @PostMapping("/daily/send") @PreAuthorize("hasRole('MANAGER')")
    public Map<String, Object> sendDaily(@RequestParam(required = false) LocalDate date) {
        UUID id = TenantContext.require();
        var row = jdbc.sql("select name, timezone from properties where id = ?").param(id).query().listOfRows().get(0);
        var ref = new JobRunner.PropertyRef(id, String.valueOf(row.get("name")), ZoneId.of(String.valueOf(row.get("timezone"))));
        LocalDate businessDate = date != null ? date : reports.businessDay(null, ref.zone()).businessDate();
        return dailyReports.send(ref, businessDate, settings.current());
    }

    /** The dashboard's forecast: occupancy, room nights, ADR, RevPAR and revenue for the next nights. */
    @GetMapping("/forecast") @PreAuthorize("hasAuthority('PERM_revenue.view')")
    public Map<String, Object> forecast(@RequestParam(required = false) LocalDate from, @RequestParam(defaultValue = "14") int days) {
        return reports.forecast(from, days);
    }

    @GetMapping("/month") @PreAuthorize("hasAuthority('PERM_revenue.view')")
    public Map<String, Object> month(@RequestParam(required = false) String month) {
        return reports.month(month == null ? YearMonth.now() : YearMonth.parse(month));
    }

    /** CSV for the accountant: one row per tax rate, which is what GSTR-1 needs. */
    @GetMapping(value = "/month.csv", produces = "text/csv") @PreAuthorize("hasAuthority('PERM_revenue.view')")
    public ResponseEntity<byte[]> monthCsv(@RequestParam(required = false) String month) {
        var data = reports.month(month == null ? YearMonth.now() : YearMonth.parse(month));
        StringBuilder csv = new StringBuilder("rate_bp,taxable_paise,cgst_paise,sgst_paise,igst_paise\n");
        for (var r : (List<Map<String, Object>>) data.get("taxableByRate"))
            csv.append(r.get("tax_rate_bp")).append(',').append(r.get("taxable")).append(',').append(r.get("cgst")).append(',').append(r.get("sgst"))
                    .append(',').append(r.get("igst")).append('\n');
        return csvResponse(csv.toString(), "month-" + data.get("month") + ".csv");
    }

    @GetMapping("/outstanding") @PreAuthorize("hasAuthority('PERM_reservations.view')")
    public List<Map<String, Object>> outstanding() { return reports.outstanding(); }

    @GetMapping("/cash-in-hand") @PreAuthorize("hasAuthority('PERM_revenue.view')")
    public List<Map<String, Object>> cashInHand() { return reports.cashInHand(); }

    @PostMapping("/cash-handover") @PreAuthorize("hasRole('MANAGER')")
    public Map<String, Object> handOver(@AuthenticationPrincipal CurrentUser u, @RequestBody HandoverInput in) {
        return reports.handOverCash(in.userId() == null ? u.id() : in.userId(), u.id(), in.notes());
    }

    @GetMapping("/police-register") @PreAuthorize("hasRole('MANAGER')")
    public Map<String, Object> policeRegister(@RequestParam LocalDate from, @RequestParam LocalDate to) { return reports.policeRegister(from, to); }

    @GetMapping(value = "/police-register.csv", produces = "text/csv") @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<byte[]> policeRegisterCsv(@RequestParam LocalDate from, @RequestParam LocalDate to) {
        var data = reports.policeRegister(from, to);
        List<String> columns = (List<String>) data.get("columns");
        StringBuilder csv = new StringBuilder(String.join(",", columns)).append('\n');
        int serial = 0;
        for (var row : (List<Map<String, Object>>) data.get("rows")) {
            serial++;
            List<String> cells = new java.util.ArrayList<>();
            for (String c : columns) cells.add(quote(cell(c, row, serial)));
            csv.append(String.join(",", cells)).append('\n');
        }
        return csvResponse(csv.toString(), "guest-register-" + from + "-to-" + to + ".csv");
    }

    private static String cell(String column, Map<String, Object> row, int serial) {
        return switch (column) {
            case "serial" -> String.valueOf(serial);
            case "id" -> str(row.get("id_type")) + (row.get("id_last4") == null ? "" : " ****" + row.get("id_last4"));
            case "unit" -> str(row.get("units"));
            case "arrival" -> str(row.get("arrive_at"));
            case "departure" -> str(row.get("depart_at"));
            default -> str(row.get(column));
        };
    }

    private static String str(Object o) { return o == null ? "" : String.valueOf(o); }
    private static String quote(String s) { return s.contains(",") || s.contains("\"") ? '"' + s.replace("\"", "\"\"") + '"' : s; }

    private static ResponseEntity<byte[]> csvResponse(String csv, String filename) {
        byte[] bytes = ("﻿" + csv).getBytes(StandardCharsets.UTF_8); // BOM so Excel reads Hindi correctly
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"").body(bytes);
    }
}
