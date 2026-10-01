package in.pms.inventory;

import in.pms.config.RoomDefaults;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.UUID;

/**
 * The floor plan a property opens with, laid into a property that has none.
 *
 * <p>Two callers, one method. Onboarding furnishes a brand-new property inside its own transaction; and on
 * start-up, any property still sitting on an empty rooms screen — one made before this existed — gets the
 * same plan, so an owner signing in today is not looking at nothing.
 *
 * <p>The rule that makes this safe to run on every boot: <b>a property with even one room is never touched.</b>
 * Rooms cannot be deleted in this product, only taken out of use, so "no rooms at all" means "never set up",
 * not "emptied on purpose". A property that already has a room type keeps it and gets its rooms in that type
 * rather than a second Standard. Nothing here renames, renumbers or removes anything.
 */
@Component
public class DefaultInventory {
    private static final Logger log = LoggerFactory.getLogger(DefaultInventory.class);

    private final JdbcClient admin;
    private final RoomDefaults defaults;
    private final boolean seedExisting;
    /**
     * Used explicitly rather than through {@code @Transactional}: the start-up pass calls {@link #seed} from
     * inside this same bean, and a self-call never reaches the proxy that would open the transaction. Without
     * one, each insert runs on its own connection with auto-commit off and is rolled back when the connection
     * goes back to the pool — the room type would vanish and its rooms would fail on the foreign key.
     */
    private final TransactionTemplate tx;

    public DefaultInventory(@Qualifier("adminJdbc") JdbcClient admin, RoomDefaults defaults,
                            @Qualifier("adminTx") PlatformTransactionManager adminTx,
                            @org.springframework.beans.factory.annotation.Value("${pms.rooms.seed-existing:true}") boolean seedExisting) {
        this.admin = admin; this.defaults = defaults; this.seedExisting = seedExisting;
        this.tx = new TransactionTemplate(adminTx);
    }

    /**
     * Lay the default plan into one property: a room type if it has none, a row per floor, and the rooms.
     *
     * <p>Runs on the admin role because onboarding has no tenant yet and the start-up pass works across
     * properties; every row it writes carries the property's own id, which is what Row Level Security checks
     * for everybody who reads them afterwards.
     *
     * @return how many rooms were created; zero when the property already had some
     */
    public int seed(UUID propertyId) {
        int existing = admin.sql("select count(*) from rooms where property_id = ?").param(propertyId).query(Integer.class).single();
        if (existing > 0) return 0;

        UUID typeId = admin.sql("select id from room_types where property_id = ? and active order by sort_order, name limit 1")
                .param(propertyId).query(UUID.class).optional()
                .orElseGet(() -> admin.sql("insert into room_types(property_id, name, max_occupancy, sort_order) values (?, ?, ?, 0) returning id")
                        .params(propertyId, defaults.defaultTypeName(), defaults.defaultMaxOccupancy()).query(UUID.class).single());

        int created = 0;
        for (int[] floorPlan : defaults.defaultPlan()) {
            int floor = floorPlan[0], count = floorPlan[1];
            admin.sql("insert into floors(property_id, number, sort_order) values (?, ?, ?) on conflict (property_id, number) do nothing")
                    .params(propertyId, floor, floor).update();
            for (int n = 1; n <= count; n++)
                created += admin.sql("insert into rooms(property_id, room_type_id, number, floor) values (?, ?, ?, ?) on conflict (property_id, number) do nothing")
                        .params(propertyId, typeId, defaults.number(floor, n), floor).update();
        }
        return created;
    }

    /**
     * Properties made before onboarding furnished anything, caught up on start-up.
     *
     * <p>Each property is its own transaction, so one that cannot be seeded — a room number that clashes with
     * something unexpected — does not stop the rest. Switch it off with {@code pms.rooms.seed-existing: false}.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void seedPropertiesWithNoRooms() {
        if (!seedExisting) return;
        List<UUID> empty = admin.sql("""
                select p.id from properties p
                where p.active and not exists (select 1 from rooms r where r.property_id = p.id)""")
                .query(UUID.class).list();
        if (empty.isEmpty()) return;
        for (UUID propertyId : empty) {
            try {
                int created = tx.execute(status -> seed(propertyId));
                if (created > 0) log.info("Laid the default floor plan into property {}: {} rooms", propertyId, created);
            } catch (Exception e) {
                log.warn("Could not lay the default floor plan into property {}: {}", propertyId, e.toString());
            }
        }
    }
}
