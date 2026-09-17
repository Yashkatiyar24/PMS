package in.pms;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Dharamshala PMS API.
 *
 * Design rules that every package follows:
 * <ul>
 *   <li>Tenant work runs on the {@code pms_app} database role inside a transaction that carries
 *       the property id; Postgres Row Level Security does the isolation, the code only narrows.</li>
 *   <li>Every rule that varies by property is a key in the settings registry, never an {@code if} in code.</li>
 *   <li>Every write to guest, booking or money data leaves an audit row.</li>
 *   <li>External services (storage, SMS, email, WhatsApp, push, PDF) sit behind small interfaces
 *       chosen by configuration, with a console fallback for development.</li>
 * </ul>
 */
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class PmsApplication {
    public static void main(String[] args) {
        SpringApplication.run(PmsApplication.class, args);
    }
}
