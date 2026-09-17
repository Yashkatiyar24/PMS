package in.pms.messaging;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;

/**
 * Outbound messages are rows, not calls (PRD section 8). Nothing is sent inside a request transaction, so a
 * WhatsApp or SMS outage can never block a check-in, and a crash between commit and send cannot lose a message.
 * The idempotency key makes a retry or a replayed offline request harmless.
 */
@Service
public class Outbox {
    private final JdbcClient jdbc;
    private final ObjectMapper json;

    public Outbox(@Qualifier("jdbc") JdbcClient jdbc, ObjectMapper json) { this.jdbc = jdbc; this.json = json; }

    /**
     * Queue a message. Call inside the transaction that made the change it describes.
     *
     * @param channel  whatsapp, sms, email or push
     * @param payload  channel-specific fields, read by {@link OutboxWorker}
     * @param idempotencyKey stable per logical message, e.g. {@code booking_confirmed:<bookingId>}
     */
    public void enqueue(UUID propertyId, String channel, Map<String, Object> payload, String idempotencyKey) {
        try {
            jdbc.sql("""
                    insert into outbox(property_id, channel, payload, idempotency_key)
                    values (?, ?::outbox_channel, ?::jsonb, ?)
                    on conflict (idempotency_key) do nothing""")
                    .params(propertyId, channel, json.writeValueAsString(payload), idempotencyKey).update();
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialise outbox payload", e);
        }
    }
}
