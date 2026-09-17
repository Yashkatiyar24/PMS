package in.pms.messaging;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.pms.config.PmsProperties;
import in.pms.integrations.email.EmailProvider;
import in.pms.integrations.push.PushProvider;
import in.pms.integrations.sms.SmsProvider;
import in.pms.integrations.storage.StorageProvider;
import in.pms.integrations.whatsapp.WhatsAppProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Delivers queued messages, with backoff and at most one send per row.
 *
 * <p>Rows are claimed with {@code for update skip locked}, so several application instances can run this
 * without sending anything twice. Each row is its own transaction, so one bad message cannot roll back
 * another. After the configured number of attempts a row is marked dead and the team is alerted rather
 * than retried forever.
 *
 * <p>This is the work; {@link OutboxWorker} is only the schedule.
 *
 * <p>Transactions are opened explicitly rather than with {@code @Transactional}: {@link #drain} calls
 * {@link #sendOne} on itself, and a self-call never passes through the proxy that would start one.
 */
@Service
public class OutboxSender {
    private static final Logger log = LoggerFactory.getLogger(OutboxSender.class);

    private final JdbcClient admin;
    private final ObjectMapper json;
    private final WhatsAppProvider whatsapp;
    private final SmsProvider sms;
    private final EmailProvider email;
    private final PushProvider push;
    private final StorageProvider storage;
    private final PmsProperties props;
    private final TransactionTemplate tx;

    public OutboxSender(@Qualifier("adminJdbc") JdbcClient admin, ObjectMapper json, WhatsAppProvider whatsapp, SmsProvider sms,
                        EmailProvider email, PushProvider push, StorageProvider storage, PmsProperties props,
                        @Qualifier("adminTx") PlatformTransactionManager adminTx) {
        this.admin = admin; this.json = json; this.whatsapp = whatsapp; this.sms = sms;
        this.email = email; this.push = push; this.storage = storage; this.props = props;
        this.tx = new TransactionTemplate(adminTx);
    }

    /** @return how many rows were processed. */
    public int drain(int batch) {
        List<UUID> ids = claim(batch);
        for (UUID id : ids) sendOne(id);
        return ids.size();
    }

    /** Claim rows for this instance; {@code skip locked} lets several instances share the queue. */
    public List<UUID> claim(int batch) {
        return tx.execute(status -> admin.sql("""
                select id from outbox
                where status = 'pending' and send_after <= now()
                order by send_after
                limit ? for update skip locked""").param(batch).query(UUID.class).list());
    }

    /** One row, one transaction: a failure here never rolls back another message. */
    public void sendOne(UUID id) {
        tx.executeWithoutResult(status -> send(id));
    }

    private void send(UUID id) {
        var row = admin.sql("select channel::text as channel, payload::text as payload, attempts from outbox where id = ? and status = 'pending' for update")
                .param(id).query().listOfRows().stream().findFirst().orElse(null);
        if (row == null) return;
        int attempts = ((Number) row.get("attempts")).intValue();
        try {
            Map<String, Object> payload = json.readValue(String.valueOf(row.get("payload")), new com.fasterxml.jackson.core.type.TypeReference<>() {});
            dispatch(String.valueOf(row.get("channel")), payload);
            admin.sql("update outbox set status = 'sent', sent_at = now(), attempts = attempts + 1 where id = ?").param(id).update();
        } catch (Exception e) {
            int next = attempts + 1;
            boolean dead = next >= props.jobs().outboxMaxAttempts();
            OffsetDateTime retryAt = OffsetDateTime.now().plus(Duration.ofMinutes((long) Math.pow(2, Math.min(next, 6)))); // 2, 4, 8 ... minutes
            admin.sql("update outbox set status = ?::outbox_status, attempts = ?, last_error = ?, send_after = ? where id = ?")
                    .params(dead ? "dead" : "pending", next, truncate(e.getMessage()), retryAt, id).update();
            if (dead) alertTeam(id, e);
            log.warn("Outbox {} attempt {} failed: {}", id, next, e.toString());
        }
    }

    private void dispatch(String channel, Map<String, Object> p) {
        switch (channel) {
            case "whatsapp" -> {
                String key = String.valueOf(p.getOrDefault("documentKey", ""));
                String documentUrl = key.isBlank() ? null : storage.signedGetUrl(key, Duration.ofHours(24));
                whatsapp.sendTemplate(e164(String.valueOf(p.get("to"))), String.valueOf(p.get("template")),
                        String.valueOf(p.getOrDefault("language", "hi")), strings(p.get("params")),
                        documentUrl, String.valueOf(p.getOrDefault("documentFilename", "document.pdf")));
            }
            case "sms" -> sms.sendOtp(String.valueOf(p.get("to")), String.valueOf(p.get("text")));
            case "email" -> email.send(String.valueOf(p.get("to")), String.valueOf(p.get("subject")), String.valueOf(p.get("html")), List.of());
            case "push" -> {
                boolean valid = push.send(String.valueOf(p.get("token")), String.valueOf(p.get("title")), String.valueOf(p.get("body")), Map.of());
                if (!valid) admin.sql("delete from push_tokens where token = ?").param(String.valueOf(p.get("token"))).update();
            }
            default -> throw new IllegalStateException("Unknown channel " + channel);
        }
    }

    private void alertTeam(UUID id, Exception cause) {
        String to = props.ops().teamAlertEmail();
        if (to == null || to.isBlank()) return;
        try { email.send(to, "PMS: message could not be delivered", "<p>Outbox row " + id + " gave up: " + truncate(cause.getMessage()) + "</p>", List.of()); }
        catch (Exception e) { log.error("Could not alert the team about outbox {}", id, e); }
    }

    @SuppressWarnings("unchecked")
    private static List<String> strings(Object o) { return o instanceof List<?> l ? (List<String>) l : List.of(); }
    private static String e164(String phone) { String d = phone.replaceAll("\\D", ""); return d.length() == 10 ? "91" + d : d; }
    private static String truncate(String s) { return s == null ? "" : s.substring(0, Math.min(500, s.length())); }
}
