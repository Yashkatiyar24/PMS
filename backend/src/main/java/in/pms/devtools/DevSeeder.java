package in.pms.devtools;

import in.pms.auth.PasswordService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Seeds the pilot property for development when {@code pms.seed.enabled=true}. Idempotent.
 * Logins: owner@pms.local / manager@pms.local / staff@pms.local with password "password123";
 * phones 9000000001..3 for OTP; approval PIN 1234.
 */
@Component
@ConditionalOnProperty(name = "pms.seed.enabled", havingValue = "true")
public class DevSeeder implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(DevSeeder.class);
    private final JdbcClient admin;
    private final PasswordService passwords;

    public DevSeeder(@Qualifier("adminJdbc") JdbcClient admin, PasswordService passwords) { this.admin = admin; this.passwords = passwords; }

    @Override
    @Transactional("adminTx")
    public void run(String... args) {
        if (!admin.sql("select id from properties where name = 'Shri Ram Dharamshala'").query(UUID.class).list().isEmpty()) {
            log.info("seed: pilot property already present");
            return;
        }
        UUID org = admin.sql("insert into organisations(name, plan_code) values ('Shri Ram Seva Trust', 'standard') returning id").query(UUID.class).single();
        UUID prop = admin.sql("""
                insert into properties(org_id, name, address, city, state, phone, trust_reg_no, settings)
                values (?, 'Shri Ram Dharamshala', 'Near Har Ki Pauri', 'Haridwar', 'Uttarakhand', '01334-000000', 'UK/HRD/2001/123',
                        '{"receipt_prefix":"SRD","upi_vpa":"shriram@upi","upi_payee_name":"Shri Ram Seva Trust","deposit_default_paise":20000}'::jsonb)
                returning id""").param(org).query(UUID.class).single();

        String pw = passwords.hash("password123");
        UUID owner = user("Ramesh Agarwal", "9000000001", "owner@pms.local", pw, false);
        UUID manager = user("Suresh Sharma", "9000000002", "manager@pms.local", pw, false);
        UUID staff = user("Mohan Lal", "9000000003", "staff@pms.local", pw, false);
        user("PMS Admin", "9000000000", "admin@pms.local", pw, true);

        String pin = passwords.hash("1234");
        admin.sql("insert into property_users(property_id, user_id, role, approval_pin_hash) values (?, ?, 'owner', ?), (?, ?, 'manager', ?), (?, ?, 'staff', null)")
                .params(prop, owner, pin, prop, manager, pin, prop, staff).update();

        UUID ac = roomType(prop, "AC Room", 150000, 3, 30000, false, 0, 1);
        UUID nonAc = roomType(prop, "Non-AC Room", 80000, 3, 20000, false, 0, 2);
        UUID dorm = roomType(prop, "Dormitory", 20000, 1, 0, true, 10, 3);
        for (int n = 101; n <= 110; n++) room(prop, nonAc, String.valueOf(n), 1);
        for (int n = 201; n <= 208; n++) room(prop, ac, String.valueOf(n), 2);
        for (String d : List.of("D1", "D2")) {
            UUID r = room(prop, dorm, d, 0);
            for (int b = 1; b <= 10; b++) admin.sql("insert into beds(property_id, room_id, label) values (?, ?, ?)").params(prop, r, d + "-" + b).update();
        }
        // GST slabs in force from 22 Sept 2025: 5% up to 7,500/day, 18% above. Data, not code.
        admin.sql("insert into tax_rules(property_id, effective_from, rules) values (?, '2025-09-22', '{\"slabs\":[{\"uptoPaise\":750000,\"bp\":500},{\"bp\":1800}],\"note\":\"GST 2.0 hotel accommodation\"}'::jsonb)").param(prop).update();
        log.info("seed: pilot property {} created", prop);
    }

    private UUID user(String name, String phone, String email, String pw, boolean superAdmin) {
        return admin.sql("insert into users(name, phone, email, password_hash, is_super_admin) values (?, ?, ?, ?, ?) returning id")
                .params(name, phone, email, pw, superAdmin).query(UUID.class).single();
    }

    private UUID roomType(UUID prop, String name, long rate, int occ, long extra, boolean dorm, int beds, int order) {
        return admin.sql("insert into room_types(property_id, name, base_rate_paise, max_occupancy, extra_person_paise, is_dormitory, bed_count, sort_order) values (?, ?, ?, ?, ?, ?, ?, ?) returning id")
                .params(prop, name, rate, occ, extra, dorm, beds, order).query(UUID.class).single();
    }

    private UUID room(UUID prop, UUID type, String number, int floor) {
        return admin.sql("insert into rooms(property_id, room_type_id, number, floor) values (?, ?, ?, ?) returning id").params(prop, type, number, floor).query(UUID.class).single();
    }
}
