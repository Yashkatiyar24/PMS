package in.pms.guests;

import in.pms.audit.AuditService;
import in.pms.common.BadRequestException;
import in.pms.common.NotFoundException;
import in.pms.integrations.storage.StorageProvider;
import in.pms.settings.SettingsService;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Guest records (PRD G1–G3). Phone is the lookup key within a property. A full Aadhaar number is never
 * accepted anywhere: any 12-digit run in the ID or notes fields is rejected. ID photos go to object storage
 * under a per-property prefix and are served only through short-lived signed URLs.
 */
@Service
public class GuestService {
    private static final Pattern TWELVE_DIGITS = Pattern.compile("(?<!\\d)\\d{4}\\s?\\d{4}\\s?\\d{4}(?!\\d)");
    private static final Set<String> ID_TYPES = Set.of("aadhaar", "voter", "dl", "passport", "other");
    private static final Set<String> IMAGE_TYPES = Set.of("image/jpeg", "image/png", "image/webp");

    private final JdbcClient jdbc;
    private final AuditService audit;
    private final StorageProvider storage;
    private final SettingsService settings;

    public GuestService(@Qualifier("jdbc") JdbcClient jdbc, AuditService audit, StorageProvider storage, SettingsService settings) {
        this.jdbc = jdbc; this.audit = audit; this.storage = storage; this.settings = settings;
    }

    public record GuestInput(String name, String phone, String city, String address, String nationality, String idType, String idLast4,
                             String passportNo, String visaNo, LocalDate visaExpiry, String notes) {}

    @Transactional(readOnly = true)
    public List<Guest> lookupByPhone(String phone) {
        String digits = phone == null ? "" : phone.replaceAll("\\D", "");
        if (digits.length() < 4) return List.of();
        return jdbc.sql("select * from guests where property_id = ? and phone like ? order by updated_at desc limit 10")
                .params(TenantContext.require(), "%" + digits.substring(Math.max(0, digits.length() - 10))).query(this::map).list();
    }

    @Transactional(readOnly = true)
    public List<Guest> search(String q) {
        String like = "%" + (q == null ? "" : q.trim().toLowerCase()) + "%";
        return jdbc.sql("select * from guests where property_id = ? and (lower(name) like ? or phone like ?) order by updated_at desc limit 25")
                .params(TenantContext.require(), like, like).query(this::map).list();
    }

    @Transactional(readOnly = true)
    public Guest get(UUID id) { return find(id); }

    @Transactional
    public Guest create(GuestInput in, UUID userId) {
        GuestInput v = validate(in);
        UUID id = jdbc.sql("""
                insert into guests(property_id, name, phone, city, address, nationality, id_type, id_last4, passport_no, visa_no, visa_expiry, notes)
                values (?, ?, ?, ?, ?, ?, ?::id_type, ?, ?, ?, ?, ?) returning id""")
                .params(TenantContext.require(), v.name(), v.phone(), v.city(), v.address(), v.nationality(), v.idType(), v.idLast4(), v.passportNo(), v.visaNo(), v.visaExpiry(), v.notes())
                .query(UUID.class).single();
        Guest g = find(id);
        audit.record("guests", id.toString(), "create", null, g, userId);
        return g;
    }

    @Transactional
    public Guest update(UUID id, GuestInput in, UUID userId) {
        GuestInput v = validate(in);
        Guest before = find(id);
        jdbc.sql("""
                update guests set name = ?, phone = ?, city = ?, address = ?, nationality = ?, id_type = ?::id_type, id_last4 = ?, passport_no = ?, visa_no = ?, visa_expiry = ?, notes = ?, updated_at = now()
                where id = ? and property_id = ?""")
                .params(v.name(), v.phone(), v.city(), v.address(), v.nationality(), v.idType(), v.idLast4(), v.passportNo(), v.visaNo(), v.visaExpiry(), v.notes(), id, TenantContext.require()).update();
        Guest after = find(id);
        audit.record("guests", id.toString(), "update", before, after, userId);
        return after;
    }

    /** Store an ID photo. Size limit comes from settings; the client compresses before upload. */
    @Transactional
    public Guest storeIdPhoto(UUID id, InputStream data, long length, String contentType, UUID userId) {
        if (!IMAGE_TYPES.contains(contentType)) throw new BadRequestException("ID photo must be JPEG, PNG or WebP");
        long maxBytes = settings.current().idPhotoMaxKb() * 1024L * 2; // tolerance: client target is soft
        if (length > maxBytes) throw new BadRequestException("ID photo is too large; compress it below " + settings.current().idPhotoMaxKb() + " KB");
        Guest before = find(id);
        String ext = switch (contentType) { case "image/png" -> "png"; case "image/webp" -> "webp"; default -> "jpg"; };
        String key = TenantContext.require() + "/id-photos/" + id + "-" + UUID.randomUUID() + "." + ext;
        storage.put(key, data, length, contentType);
        jdbc.sql("update guests set id_photo_key = ?, id_photo_purged_at = null, updated_at = now() where id = ? and property_id = ?").params(key, id, TenantContext.require()).update();
        audit.record("guests", id.toString(), "id_photo", java.util.Map.of("hadPhoto", before.hasIdPhoto()), java.util.Map.of("hadPhoto", true), userId);
        return find(id);
    }

    /** A URL valid for a few minutes. Viewing is audited because it is personal data. */
    @Transactional
    public String idPhotoUrl(UUID id, UUID userId) {
        String key = jdbc.sql("select id_photo_key from guests where id = ? and property_id = ?").params(id, TenantContext.require()).query(String.class).optional()
                .orElseThrow(() -> new NotFoundException("ID photo"));
        if (key == null) throw new NotFoundException("ID photo");
        audit.record("guests", id.toString(), "id_photo_view", null, null, userId);
        return storage.signedGetUrl(key, Duration.ofMinutes(5));
    }

    /**
     * The rules the register depends on, in one place so the desk's form and the guest's own phone cannot
     * drift apart: a name is required, a phone is ten digits, an ID type is one we know, and a full Aadhaar
     * number is refused wherever it is typed. Returns the tidied values.
     */
    public GuestInput validateForRegister(GuestInput in) { return validate(in); }

    private GuestInput validate(GuestInput in) {
        if (in.name() == null || in.name().isBlank()) throw new BadRequestException("Name is required");
        String phone = in.phone() == null ? "" : in.phone().replaceAll("\\D", "");
        if (phone.startsWith("91") && phone.length() == 12) phone = phone.substring(2);
        if (!phone.isEmpty() && phone.length() != 10) throw new BadRequestException("Phone must be 10 digits");
        String idType = in.idType() == null || in.idType().isBlank() ? null : in.idType();
        if (idType != null && !ID_TYPES.contains(idType)) throw new BadRequestException("Unknown ID type");
        String last4 = in.idLast4() == null ? null : in.idLast4().trim();
        if (last4 != null && !last4.isEmpty() && !last4.matches("[A-Za-z0-9]{4}")) throw new BadRequestException("ID last 4 must be exactly 4 characters");
        for (String s : new String[]{in.idLast4(), in.notes(), in.address(), in.name()})
            if (s != null && TWELVE_DIGITS.matcher(s).find()) throw new BadRequestException("Do not enter a full Aadhaar number; only the last 4 digits");
        String nat = in.nationality() == null || in.nationality().isBlank() ? "IN" : in.nationality().trim().toUpperCase();
        if (!"IN".equals(nat) && (in.passportNo() == null || in.passportNo().isBlank())) throw new BadRequestException("Passport number is required for foreign guests");
        return new GuestInput(in.name().trim(), phone, nz(in.city()), nz(in.address()), nat, idType, last4 == null || last4.isEmpty() ? null : last4,
                blankToNull(in.passportNo()), blankToNull(in.visaNo()), in.visaExpiry(), nz(in.notes()));
    }

    private static String nz(String s) { return s == null ? "" : s.trim(); }
    private static String blankToNull(String s) { return s == null || s.isBlank() ? null : s.trim(); }

    private Guest find(UUID id) {
        return jdbc.sql("select * from guests where id = ? and property_id = ?").params(id, TenantContext.require()).query(this::map).optional().orElseThrow(() -> new NotFoundException("Guest"));
    }

    private Guest map(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        var visa = rs.getObject("visa_expiry", LocalDate.class);
        return new Guest(rs.getObject("id", UUID.class), rs.getString("name"), rs.getString("phone"), rs.getString("city"), rs.getString("address"), rs.getString("nationality"),
                rs.getString("id_type"), rs.getString("id_last4"), rs.getString("id_photo_key") != null && rs.getObject("id_photo_purged_at") == null,
                rs.getString("passport_no"), rs.getString("visa_no"), visa, rs.getString("notes"));
    }
}
