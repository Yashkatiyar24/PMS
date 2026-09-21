package in.pms.common;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** Cheap liveness for the uptime monitor and the deploy script: the database answers. Nothing about the queue or the data. */
@RestController
public class HealthController {
    private final JdbcClient adminJdbc;

    public HealthController(@Qualifier("adminJdbc") JdbcClient adminJdbc) { this.adminJdbc = adminJdbc; }

    @GetMapping("/api/health")
    public Map<String, Object> health() {
        adminJdbc.sql("select 1").query(Integer.class).single();
        return Map.of("status", "ok");
    }
}
