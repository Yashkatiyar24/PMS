package in.pms.property;

import in.pms.audit.AuditService;
import in.pms.common.BadRequestException;
import in.pms.integrations.storage.StorageProvider;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** The property's own record (PRD P1). Settings live separately in the registry. */
@Service
public class PropertyService {
    /** Long enough for a booking page left open over lunch; short enough that a copied link goes stale. */
    static final Duration PHOTO_LINK_TTL = Duration.ofHours(6);
    static final Set<String> IMAGE_TYPES = Set.of("image/jpeg", "image/png", "image/webp");
    /** The client shrinks the photo before sending; this only stops a raw camera file or something that is no photo at all. */
    static final long PHOTO_MAX_BYTES = 5L * 1024 * 1024;

    private final JdbcClient jdbc;
    private final AuditService audit;
    private final StorageProvider storage;

    public PropertyService(@Qualifier("jdbc") JdbcClient jdbc, AuditService audit, StorageProvider storage) {
        this.jdbc = jdbc; this.audit = audit; this.storage = storage;
    }

    /** {@code photoUrl} is a short-lived link to the property's photograph, or null when there is none. */
    public record Property(UUID id, String name, String address, String city, String state, String phone, String email, String gstin,
                           String trustRegNo, String reg12a, String reg80g, String timezone, String code, String photoUrl) {
        /** The record without its expiring link, so an audit diff shows only what actually changed. */
        Property forAudit() { return new Property(id, name, address, city, state, phone, email, gstin, trustRegNo, reg12a, reg80g, timezone, code, null); }
    }
    public record PropertyInput(String name, String address, String city, String state, String phone, String email, String gstin,
                                String trustRegNo, String reg12a, String reg80g, String timezone) {}

    @Transactional(readOnly = true)
    public Property current() { return find(); }

    @Transactional
    public Property update(PropertyInput in, UUID userId) {
        if (in.name() == null || in.name().isBlank()) throw new BadRequestException("Name is required");
        String gstin = in.gstin() == null || in.gstin().isBlank() ? null : in.gstin().trim().toUpperCase();
        if (gstin != null && !gstin.matches("\\d{2}[A-Z]{5}\\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]")) throw new BadRequestException("GSTIN format is invalid");
        String tz = in.timezone() == null || in.timezone().isBlank() ? "Asia/Kolkata" : in.timezone();
        try { java.time.ZoneId.of(tz); } catch (Exception e) { throw new BadRequestException("Unknown timezone"); }
        Property before = find();
        jdbc.sql("""
                update properties set name = ?, address = ?, city = ?, state = ?, phone = ?, email = ?, gstin = ?, trust_reg_no = ?, reg_12a = ?, reg_80g = ?, timezone = ?, updated_at = now()
                where id = ?""")
                .params(in.name().trim(), nz(in.address()), nz(in.city()), nz(in.state()), nz(in.phone()), blank(in.email()), gstin, blank(in.trustRegNo()), blank(in.reg12a()), blank(in.reg80g()), tz, TenantContext.require())
                .update();
        Property after = find();
        audit.record("properties", after.id().toString(), "update", before.forAudit(), after.forAudit(), userId);
        return after;
    }

    /** The property's photograph, replacing any earlier one. Stored under the property, served by signed link. */
    @Transactional
    public Property storePhoto(InputStream data, long length, String contentType, UUID userId) {
        UUID propertyId = TenantContext.require();
        String old = photoKey();
        String key = photoKey(propertyId, length, contentType);
        storage.put(key, in.pms.files.Uploads.checked(data, contentType), length, contentType);
        jdbc.sql("update properties set photo_key = ?, updated_at = now() where id = ?").params(key, propertyId).update();
        if (old != null) storage.delete(old);
        audit.record("properties", propertyId.toString(), "photo", null, Map.of("hasPhoto", true), userId);
        return find();
    }

    @Transactional
    public Property removePhoto(UUID userId) {
        UUID propertyId = TenantContext.require();
        String old = photoKey();
        jdbc.sql("update properties set photo_key = null, updated_at = now() where id = ?").param(propertyId).update();
        if (old != null) storage.delete(old);
        audit.record("properties", propertyId.toString(), "photo", null, Map.of("hasPhoto", false), userId);
        return find();
    }

    /** Where a property's photo goes, once it has been checked to be a photo. Shared with the platform's own upload. */
    public static String photoKey(UUID propertyId, long length, String contentType) {
        if (!IMAGE_TYPES.contains(contentType)) throw new BadRequestException("The photo must be a JPEG, PNG or WebP image");
        if (length <= 0) throw new BadRequestException("No photo was received");
        if (length > PHOTO_MAX_BYTES) throw new BadRequestException("The photo is too large; keep it under 5 MB");
        String ext = switch (contentType) { case "image/png" -> "png"; case "image/webp" -> "webp"; default -> "jpg"; };
        return propertyId + "/property/photo-" + UUID.randomUUID() + "." + ext;
    }

    /** A short-lived link to a stored photo, or null when there is none. */
    public static String photoUrl(StorageProvider storage, String key) {
        return key == null ? null : storage.signedGetUrl(key, PHOTO_LINK_TTL);
    }

    private String photoKey() {
        return (String) jdbc.sql("select photo_key from properties where id = ?").param(TenantContext.require()).query().singleRow().get("photo_key");
    }

    private static String nz(String s) { return s == null ? "" : s.trim(); }
    private static String blank(String s) { return s == null || s.isBlank() ? null : s.trim(); }

    private Property find() {
        return jdbc.sql("select * from properties where id = ?").param(TenantContext.require()).query((rs, i) -> new Property(
                rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("address"), rs.getString("city"), rs.getString("state"), rs.getString("phone"), rs.getString("email"),
                rs.getString("gstin"), rs.getString("trust_reg_no"), rs.getString("reg_12a"), rs.getString("reg_80g"), rs.getString("timezone"), rs.getString("code"),
                photoUrl(storage, rs.getString("photo_key")))).single();
    }
}
