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

    public ReportController(ReportService reports, DailyReportService dailyReports, SettingsService settings, @Qualifier("jdbc") JdbcClient jdbc) {
        this.reports = reports; this.dailyReports = dailyReports; this.settings = settings; this.jdbc = jdbc;
    }

    public record HandoverInput(UUID userId, String notes) {}

    @GetMapping("/daily") @PreAuthorize("hasRole('MANAGER')")
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

    @GetMapping("/month") @PreAuthorize("hasRole('MANAGER')")
    public Map<String, Object> month(@RequestParam(required = false) String month) {
        return reports.month(month == null ? YearMonth.now() : YearMonth.parse(month));
    }

    /** CSV for the accountant: one row per tax rate, which is what GSTR-1 needs. */
    @GetMapping(value = "/month.csv", produces = "text/csv") @PreAuthorize("hasRole('MANAGER')")
    public ResponseEntity<byte[]> monthCsv(@RequestParam(required = false) String month) {
        var data = reports.month(month == null ? YearMonth.now() : YearMonth.parse(month));
        StringBuilder csv = new StringBuilder("rate_bp,taxable_paise,cgst_paise,sgst_paise\n");
        for (var r : (List<Map<String, Object>>) data.get("taxableByRate"))
            csv.append(r.get("tax_rate_bp")).append(',').append(r.get("taxable")).append(',').append(r.get("cgst")).append(',').append(r.get("sgst")).append('\n');
        return csvResponse(csv.toString(), "month-" + data.get("month") + ".csv");
    }

    @GetMapping("/outstanding")
    public List<Map<String, Object>> outstanding() { return reports.outstanding(); }

    @GetMapping("/cash-in-hand") @PreAuthorize("hasRole('MANAGER')")
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
