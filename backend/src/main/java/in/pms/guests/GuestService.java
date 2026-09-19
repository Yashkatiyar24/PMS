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
import java.time.OffsetDateTime;
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

    /** What the desk types about a guest. email, state and country were added later; null leaves them as they are. */
    public record GuestInput(String name, String phone, String city, String address, String nationality, String idType, String idLast4,
                             String passportNo, String visaNo, LocalDate visaExpiry, String notes, String email, String state, String country) {
        public GuestInput(String name, String phone, String city, String address, String nationality, String idType, String idLast4,
                          String passportNo, String visaNo, LocalDate visaExpiry, String notes) {
            this(name, phone, city, address, nationality, idType, idLast4, passportNo, visaNo, visaExpiry, notes, null, null, null);
        }
    }

    @Transactional(readOnly = true)
    public List<Guest> lookupByPhone(String phone) {
        String digits = phone == null ? "" : phone.replaceAll("\\D", "");
        if (digits.length() < 4) return List.of();
        return jdbc.sql("select * from guests where property_id = ? and phone like ? order by updated_at desc limit 10")
                .params(TenantContext.require(), "%" + digits.substring(Math.max(0, digits.length() - 10))).query(this::map).list();
    }

    @Transactional(readOnly = true)
    public List<Guest> search(String q) {
        String term = q == null ? "" : q.trim().toLowerCase();
        String like = "%" + term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
        return jdbc.sql("select * from guests where property_id = ? and (lower(name) like ? or phone like ? or lower(city) like ? or lower(coalesce(email, '')) like ?) order by updated_at desc limit 50")
                .params(TenantContext.require(), like, like, like, like).query(this::map).list();
    }

    public record Stay(UUID bookingId, String state, OffsetDateTime arriveAt, OffsetDateTime departAt, String units, long totalPaise, long paidPaise,
                       long balancePaise, String source) {}
    public record Payment(OffsetDateTime receivedAt, String mode, long amountPaise, boolean refund, UUID bookingId) {}
    public record Profile(Guest guest, Stay current, List<Stay> stays, List<Payment> payments, int visits, long nights, long spentPaise, long outstandingPaise) {}

    /**
     * Everything the desk knows about one guest: the stay they are in now, every stay before and after it, what
     * they paid and what they still owe. Only bookings in this property, because RLS sees no others.
     */
    @Transactional(readOnly = true)
    public Profile profile(UUID id) {
        Guest guest = find(id);
        UUID p = TenantContext.require();
        List<Stay> stays = jdbc.sql("""
                select b.id, b.state::text as state, b.arrive_at, b.depart_at, b.source::text as source,
                       coalesce(f.total_paise, 0) as total, coalesce(f.paid_paise, 0) as paid,
                       coalesce(f.total_paise + f.deposit_held_paise - f.paid_paise, 0) as balance,
                       (select string_agg(case when bd.label is null then r.number when bd.label like r.number || '%' then bd.label else r.number || '/' || bd.label end, ', ')
                          from booking_units bu join rooms r on r.id = bu.room_id left join beds bd on bd.id = bu.bed_id
                         where bu.booking_id = b.id and bu.cancelled_at is null) as units
                from bookings b left join folios f on f.booking_id = b.id
                where b.property_id = ? and b.guest_id = ? order by b.arrive_at desc""")
                .params(p, id).query((rs, i) -> new Stay(rs.getObject("id", UUID.class), rs.getString("state"), rs.getObject("arrive_at", OffsetDateTime.class),
                        rs.getObject("depart_at", OffsetDateTime.class), rs.getString("units"), rs.getLong("total"), rs.getLong("paid"), rs.getLong("balance"), rs.getString("source"))).list();
        List<Payment> payments = jdbc.sql("""
                select pm.received_at, pm.mode::text as mode, pm.amount_paise, pm.is_refund, b.id as booking_id
                from payments pm join folios f on f.id = pm.folio_id join bookings b on b.id = f.booking_id
                where pm.property_id = ? and b.guest_id = ? order by pm.received_at desc limit 100""")
                .params(p, id).query((rs, i) -> new Payment(rs.getObject("received_at", OffsetDateTime.class), rs.getString("mode"), rs.getLong("amount_paise"),
                        rs.getBoolean("is_refund"), rs.getObject("booking_id", UUID.class))).list();
        Stay current = stays.stream().filter(s -> "checked_in".equals(s.state())).findFirst().orElse(null);
        List<Stay> used = stays.stream().filter(s -> Set.of("checked_in", "checked_out").contains(s.state())).toList();
        long nights = used.stream().mapToLong(s -> Math.max(1, java.time.Duration.between(s.arriveAt(), s.departAt()).toHours() / 24)).sum();
        long spent = stays.stream().mapToLong(Stay::paidPaise).sum();
        long outstanding = stays.stream().filter(s -> !Set.of("cancelled", "no_show").contains(s.state())).mapToLong(s -> Math.max(0, s.balancePaise())).sum();
        return new Profile(guest, current, stays, payments, used.size(), nights, spent, outstanding);
    }

    /** The guest's photograph, stored like the ID photo: object storage under the property, served by signed link. */
    @Transactional
    public Guest storePhoto(UUID id, InputStream data, long length, String contentType, UUID userId) {
        if (!IMAGE_TYPES.contains(contentType)) throw new BadRequestException("The photo must be JPEG, PNG or WebP");
        long maxBytes = settings.current().idPhotoMaxKb() * 1024L * 2;
        if (length > maxBytes) throw new BadRequestException("The photo is too large; compress it below " + settings.current().idPhotoMaxKb() + " KB");
        find(id);
        String ext = switch (contentType) { case "image/png" -> "png"; case "image/webp" -> "webp"; default -> "jpg"; };
        String key = TenantContext.require() + "/guest-photos/" + id + "-" + UUID.randomUUID() + "." + ext;
        storage.put(key, data, length, contentType);
        jdbc.sql("update guests set photo_key = ?, updated_at = now() where id = ? and property_id = ?").params(key, id, TenantContext.require()).update();
        audit.record("guests", id.toString(), "photo", null, java.util.Map.of("hasPhoto", true), userId);
        return find(id);
    }

    /** A short-lived link to the photograph. Viewing is audited, like the ID photo. */
    @Transactional
    public String photoUrl(UUID id, UUID userId) {
        String key = jdbc.sql("select photo_key from guests where id = ? and property_id = ?").params(id, TenantContext.require()).query(String.class).optional().orElse(null);
        if (key == null) throw new NotFoundException("Photo");
        audit.record("guests", id.toString(), "photo_view", null, null, userId);
        return storage.signedGetUrl(key, Duration.ofMinutes(5));
    }

    @Transactional(readOnly = true)
    public Guest get(UUID id) { return find(id); }

    @Transactional
    public Guest create(GuestInput in, UUID userId) {
        GuestInput v = validate(in);
        UUID id = jdbc.sql("""
                insert into guests(property_id, name, phone, city, address, nationality, id_type, id_last4, passport_no, visa_no, visa_expiry, notes, email, state, country)
                values (?, ?, ?, ?, ?, ?, ?::id_type, ?, ?, ?, ?, ?, ?, ?, ?) returning id""")
                .params(TenantContext.require(), v.name(), v.phone(), v.city(), v.address(), v.nationality(), v.idType(), v.idLast4(), v.passportNo(), v.visaNo(), v.visaExpiry(), v.notes(),
                        v.email(), nz(v.state()), nz(v.country()))
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
                update guests set name = ?, phone = ?, city = ?, address = ?, nationality = ?, id_type = ?::id_type, id_last4 = ?, passport_no = ?, visa_no = ?, visa_expiry = ?, notes = ?,
                       email = ?, state = ?, country = ?, updated_at = now()
                where id = ? and property_id = ?""")
                .params(v.name(), v.phone(), v.city(), v.address(), v.nationality(), v.idType(), v.idLast4(), v.passportNo(), v.visaNo(), v.visaExpiry(), v.notes(),
                        in.email() == null ? before.email() : v.email(), in.state() == null ? before.state() : nz(v.state()), in.country() == null ? before.country() : nz(v.country()),
                        id, TenantContext.require()).update();
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
        String email = blankToNull(in.email());
        if (email != null && !email.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) throw new BadRequestException("That email address does not look right");
        return new GuestInput(in.name().trim(), phone, nz(in.city()), nz(in.address()), nat, idType, last4 == null || last4.isEmpty() ? null : last4,
                blankToNull(in.passportNo()), blankToNull(in.visaNo()), in.visaExpiry(), nz(in.notes()), email == null ? null : email.toLowerCase(), in.state(), in.country());
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
                rs.getString("passport_no"), rs.getString("visa_no"), visa, rs.getString("notes"),
                rs.getString("email"), rs.getString("state"), rs.getString("country"), rs.getString("photo_key") != null);
    }
}
