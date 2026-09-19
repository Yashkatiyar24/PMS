package in.pms.expenses;

import in.pms.auth.CurrentUser;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/expenses")
@PreAuthorize("hasAuthority('PERM_expenses')")
public class ExpenseController {
    private final ExpenseService expenses;

    public ExpenseController(ExpenseService expenses) { this.expenses = expenses; }

    public record VoidInput(String reason) {}

    @GetMapping
    public ExpenseService.Summary list(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                       @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) { return expenses.list(from, to); }

    @PostMapping
    public ExpenseService.Expense create(@AuthenticationPrincipal CurrentUser u, @RequestBody ExpenseService.ExpenseInput in) { return expenses.create(in, u.id()); }

    @PostMapping("/{id}/void")
    public ExpenseService.Expense voidExpense(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestBody VoidInput in) { return expenses.voidExpense(id, in.reason(), u.id()); }

    @PostMapping(value = "/{id}/receipt", consumes = "multipart/form-data")
    public ExpenseService.Expense receipt(@AuthenticationPrincipal CurrentUser u, @PathVariable UUID id, @RequestParam("file") MultipartFile file) throws IOException {
        return expenses.storeReceipt(id, file.getInputStream(), file.getSize(), String.valueOf(file.getContentType()), u.id());
    }

    @GetMapping("/{id}/receipt-url")
    public Map<String, String> receiptUrl(@PathVariable UUID id) { return Map.of("url", expenses.receiptUrl(id)); }
}
