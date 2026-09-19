package in.pms.operations;

import in.pms.expenses.ExpenseService;
import in.pms.inventory.InventoryService;
import in.pms.maintenance.MaintenanceService;
import in.pms.stock.StockService;
import in.pms.tenant.TenantContext;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Repairs, lost property, money out and supplies: the work behind the desk, and the tenant wall around it. */
@SpringBootTest
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class OperationsTest {
    @Autowired MaintenanceService maintenance;
    @Autowired InventoryService rooms;
    @Autowired ExpenseService expenses;
    @Autowired StockService stock;
    @Autowired @Qualifier("jdbc") JdbcClient jdbc;
    @Autowired @Qualifier("adminJdbc") JdbcClient admin;
    @Autowired @Qualifier("adminTx") PlatformTransactionManager adminTx;
    @Autowired @Qualifier("tenantTx") PlatformTransactionManager tenantTx;

    UUID org, property, other, room, otherRoom;

    @BeforeAll
    void setUp() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            org = admin.sql("insert into organisations(name) values ('Ops Trust') returning id").query(UUID.class).single();
            property = admin.sql("insert into properties(org_id, name, timezone) values (?, 'Ops Test', 'Asia/Kolkata') returning id").param(org).query(UUID.class).single();
            other = admin.sql("insert into properties(org_id, name, timezone) values (?, 'Other Ops', 'Asia/Kolkata') returning id").param(org).query(UUID.class).single();
            UUID type = admin.sql("insert into room_types(property_id, name, base_rate_paise) values (?, 'Std', 100000) returning id").param(property).query(UUID.class).single();
            room = admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, '101') returning id").params(property, type).query(UUID.class).single();
            UUID otherType = admin.sql("insert into room_types(property_id, name, base_rate_paise) values (?, 'Std', 100000) returning id").param(other).query(UUID.class).single();
            otherRoom = admin.sql("insert into rooms(property_id, room_type_id, number) values (?, ?, '101') returning id").params(other, otherType).query(UUID.class).single();
        });
    }

    @AfterAll
    void tearDown() {
        new TransactionTemplate(adminTx).executeWithoutResult(tx -> {
            for (String t : List.of("maintenance_tickets", "lost_found_items", "expenses", "inventory_movements", "inventory_items", "rooms", "room_types"))
                admin.sql("delete from " + t + " where property_id in (?, ?)").params(property, other).update();
            admin.sql("delete from properties where id in (?, ?)").params(property, other).update();
            admin.sql("delete from organisations where id = ?").param(org).update();
        });
    }

    <T> T as(UUID prop, Supplier<T> body) { return TenantContext.runAs(prop, () -> new TransactionTemplate(tenantTx).execute(tx -> body.get())); }
    <T> T desk(Supplier<T> body) { return as(property, body); }

    @Test
    void aRepairTakesTheRoomOffSaleAndResolvingItHandsTheRoomBackDirty() {
        var ticket = desk(() -> maintenance.create(new MaintenanceService.TicketInput(room, "Geyser not heating", "", "high", true), null));
        assertThat(ticket.status()).isEqualTo("open");
        assertThat(desk(() -> rooms.room(room)).status()).isEqualTo("maintenance");
        assertThat(admin.sql("select count(*) from notifications where property_id = ? and kind = 'maintenance'").param(property).query(Integer.class).single()).isPositive();

        assertThatThrownBy(() -> desk(() -> maintenance.update(ticket.id(), new MaintenanceService.TicketUpdate("resolved", null, null, null), null)))
                .hasMessageContaining("what was done");
        var done = desk(() -> maintenance.update(ticket.id(), new MaintenanceService.TicketUpdate("resolved", null, null, "Replaced the element"), null));
        assertThat(done.resolvedAt()).isNotNull();
        assertThat(desk(() -> rooms.room(room)).status()).isEqualTo("dirty");
        assertThat(desk(() -> maintenance.list(false))).extracting(MaintenanceService.Ticket::id).doesNotContain(ticket.id());
    }

    @Test
    void lostPropertyIsHandedBackToSomeone() {
        var item = desk(() -> maintenance.logItem(new MaintenanceService.ItemInput(room, "Black umbrella", ""), null));
        assertThatThrownBy(() -> desk(() -> maintenance.updateItem(item.id(), new MaintenanceService.ItemUpdate("returned", " ", null), null))).hasMessageContaining("returned to");
        assertThat(desk(() -> maintenance.updateItem(item.id(), new MaintenanceService.ItemUpdate("returned", "Mr Verma", null), null)).status()).isEqualTo("returned");
    }

    @Test
    void aVoidedExpenseStaysListedButLeavesTheTotals() {
        LocalDate today = LocalDate.now();
        desk(() -> expenses.create(new ExpenseService.ExpenseInput(today, "utilities", 450000, "UPPCL", "bank", "Electricity"), null));
        var wrong = desk(() -> expenses.create(new ExpenseService.ExpenseInput(today, "supplies", 99900, "", "cash", "Typo"), null));
        desk(() -> expenses.voidExpense(wrong.id(), "Entered twice", null));
        var month = desk(() -> expenses.list(today.withDayOfMonth(1), today));
        assertThat(month.totalPaise()).isEqualTo(450000);
        assertThat(month.byCategory()).containsEntry("utilities", 450000L).containsEntry("supplies", 0L);
        assertThat(month.expenses()).hasSize(2);
        assertThatThrownBy(() -> desk(() -> expenses.create(new ExpenseService.ExpenseInput(today, "gambling", 100, "", "cash", ""), null))).hasMessageContaining("Category");
        // Another property sees none of it.
        assertThat(as(other, () -> expenses.list(today.withDayOfMonth(1), today)).expenses()).isEmpty();
    }

    @Test
    void stockIsTheSumOfItsMovementsAndLinenGoesToTheLaundryAndBack() {
        var towels = desk(() -> stock.createItem(new StockService.ItemInput("Bath towel", "linen", "pcs", new BigDecimal("10"), null), null));
        desk(() -> stock.move(towels.id(), new StockService.MovementInput("opening", new BigDecimal("40"), null, null, ""), null));
        var afterLaundry = desk(() -> stock.move(towels.id(), new StockService.MovementInput("to_laundry", new BigDecimal("25"), null, null, ""), null));
        assertThat(afterLaundry.onHand()).isEqualByComparingTo("15");
        assertThat(afterLaundry.atLaundry()).isEqualByComparingTo("25");
        assertThatThrownBy(() -> desk(() -> stock.move(towels.id(), new StockService.MovementInput("from_laundry", new BigDecimal("30"), null, null, ""), null)))
                .hasMessageContaining("at the laundry");

        // Using six more leaves nine: under the line of ten, which is announced once.
        var low = desk(() -> stock.move(towels.id(), new StockService.MovementInput("consumption", new BigDecimal("6"), null, room, "torn"), null));
        assertThat(low.low()).isTrue();
        assertThat(admin.sql("select count(*) from notifications where property_id = ? and kind = 'low_stock'").param(property).query(Integer.class).single()).isEqualTo(1);
        assertThatThrownBy(() -> desk(() -> stock.move(towels.id(), new StockService.MovementInput("consumption", new BigDecimal("100"), null, null, ""), null)))
                .hasMessageContaining("in stock");

        LocalDate today = LocalDate.now(java.time.ZoneId.of("Asia/Kolkata")); // the property's day, not the server's
        var period = desk(() -> stock.period(today.minusDays(1), today));
        assertThat(period).filteredOn(r -> r.itemId().equals(towels.id())).singleElement().satisfies(r -> {
            assertThat(r.purchases()).isEqualByComparingTo("40");
            assertThat(r.consumption()).isEqualByComparingTo("6");
            assertThat(r.laundry()).isEqualByComparingTo("-25");
            assertThat(r.closing()).isEqualByComparingTo("9");
        });
        // Another property's room cannot be named, even though a foreign key alone would accept it.
        assertThatThrownBy(() -> desk(() -> stock.move(towels.id(), new StockService.MovementInput("consumption", BigDecimal.ONE, null, otherRoom, ""), null)))
                .hasMessageContaining("Room");
        // History cannot be rewritten by the app.
        assertThatThrownBy(() -> desk(() -> jdbc.sql("update inventory_movements set qty_change = 1 where item_id = ?").param(towels.id()).update()))
                .rootCause().hasMessageContaining("permission denied");
    }
}
