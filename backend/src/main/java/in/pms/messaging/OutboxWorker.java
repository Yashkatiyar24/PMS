package in.pms.messaging;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Polls the outbox. The delivery logic lives in {@link OutboxSender}. */
@Component
@ConditionalOnProperty(name = "pms.jobs.enabled", havingValue = "true", matchIfMissing = true)
public class OutboxWorker {
    private static final Logger log = LoggerFactory.getLogger(OutboxWorker.class);
    private final OutboxSender sender;

    public OutboxWorker(OutboxSender sender) { this.sender = sender; }

    @Scheduled(fixedDelayString = "${pms.jobs.outbox-poll-ms:5000}")
    public void tick() {
        try { sender.drain(25); } catch (Exception e) { log.error("Outbox worker failed", e); }
    }
}
