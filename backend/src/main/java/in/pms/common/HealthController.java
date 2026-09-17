package in.pms.common;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** Cheap liveness for Uptime Kuma and the deploy script: database reachable, outbox lag. */
@RestController
public class HealthController {
    private final JdbcClient adminJdbc;

    public HealthController(@Qualifier("adminJdbc") JdbcClient adminJdbc) { this.adminJdbc = adminJdbc; }

    @GetMapping("/api/health")
    public Map<String, Object> health() {
        Long pending = adminJdbc.sql("select count(*) from outbox where status = 'pending' and send_after < now() - interval '10 minutes'")
                .query(Long.class).single();
        return Map.of("status", "ok", "outboxLag", pending);
    }
}
