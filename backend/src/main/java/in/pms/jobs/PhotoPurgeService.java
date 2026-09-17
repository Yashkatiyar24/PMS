package in.pms.jobs;

import in.pms.audit.AuditService;
import in.pms.integrations.storage.StorageProvider;
import in.pms.tenant.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

/**
 * Deletes ID photos once the property's retention period has passed since the guest's last checkout
 * (PRD G2, DPDP purpose limitation). The guest row stays for the register; only the image goes, and each
 * deletion is audited so the owner can show what was removed and when.
 */
@Service
public class PhotoPurgeService {
    private static final Logger log = LoggerFactory.getLogger(PhotoPurgeService.class);

    private final StorageProvider storage;
    private final AuditService audit;
    private final JdbcClient jdbc;

    public PhotoPurgeService(StorageProvider storage, AuditService audit, @Qualifier("jdbc") JdbcClient jdbc) {
        this.storage = storage; this.audit = audit; this.jdbc = jdbc;
    }

    /** @return how many photos were deleted. */
    @Transactional
    public int purge(int retentionDays) {
        var due = jdbc.sql("""
                select g.id, g.id_photo_key from guests g
                where g.property_id = ? and g.id_photo_key is not null and g.id_photo_purged_at is null
                  and not exists (
                      select 1 from bookings b where b.guest_id = g.id
                        and (b.checked_out_at is null or b.checked_out_at > now() - make_interval(days => ?)))""")
                .params(TenantContext.require(), retentionDays).query().listOfRows();

        for (var row : due) {
            UUID guestId = (UUID) row.get("id");
            String key = String.valueOf(row.get("id_photo_key"));
            // Clear the row even if the object is already gone; the record of the deletion is what matters.
            try { storage.delete(key); } catch (Exception e) { log.warn("Could not delete {}: {}", key, e.toString()); }
            jdbc.sql("update guests set id_photo_key = null, id_photo_purged_at = now() where id = ? and property_id = ?").params(guestId, TenantContext.require()).update();
            audit.record("guests", guestId.toString(), "id_photo_purge", Map.of("retentionDays", retentionDays), null, null);
        }
        if (!due.isEmpty()) log.info("Purged {} ID photos", due.size());
        return due.size();
    }
}
