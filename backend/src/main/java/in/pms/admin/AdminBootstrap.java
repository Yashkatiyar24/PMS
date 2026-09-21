package in.pms.admin;

import in.pms.auth.PasswordService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The first platform admin, the one who onboards properties, on a fresh production database. Set PMS_ADMIN_EMAIL
 * and PMS_ADMIN_PASSWORD for the first start; once any platform admin exists they are ignored, so leaving them set
 * cannot reset anyone's password.
 */
@Component
public class AdminBootstrap implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);
    private final JdbcClient admin;
    private final PasswordService passwords;
    private final String email;
    private final String password;

    public AdminBootstrap(@Qualifier("adminJdbc") JdbcClient admin, PasswordService passwords,
                          @Value("${pms.bootstrap-admin.email:}") String email, @Value("${pms.bootstrap-admin.password:}") String password) {
        this.admin = admin; this.passwords = passwords; this.email = email.trim().toLowerCase(); this.password = password;
    }

    @Override
    @Transactional("adminTx")
    public void run(String... args) {
        if (email.isEmpty()) return;
        if (admin.sql("select exists (select 1 from users where is_super_admin)").query(Boolean.class).single()) return;
        if (password.length() < 12) throw new IllegalStateException("PMS_ADMIN_PASSWORD must be at least 12 characters");
        int created = admin.sql("insert into users(name, email, password_hash, is_super_admin) values ('Platform admin', ?, ?, true) on conflict (email) do nothing")
                .params(email, passwords.hash(password)).update();
        // An existing account is never quietly promoted and re-keyed: that is a decision for a person to make.
        if (created == 0) throw new IllegalStateException("PMS_ADMIN_EMAIL already belongs to a user; choose another address or promote that account deliberately");
        log.info("bootstrap: platform admin {} created", email);
    }
}
