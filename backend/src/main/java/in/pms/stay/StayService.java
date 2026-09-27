package in.pms.stay;

import in.pms.audit.AuditService;
import in.pms.config.PmsProperties;
import in.pms.integrations.storage.StorageProvider;
import in.pms.money.Money;
import in.pms.print.Qr;
import in.pms.settings.SettingsService;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The guest's own view of their own stay, on their own phone, with no account.
 *
 * <p>Built to the same rules as guest self-registration, because it is reached the same way — by a stranger
 * holding a link:
 *
 * <ul>
 *   <li><b>The token is the whole credential and is never stored</b>, only its SHA-256. A booking reference
 *       is not a credential: {@code BOOKING_ID} in a URL must never be enough, so it is not used here.</li>
 *   <li><b>A token names one booking.</b> It is resolved on the admin role, since no tenant is known before
 *       it is read; everything after runs inside that property, so RLS still decides what can be seen.</li>
 *   <li><b>Reading tells you nothing else.</b> No property id, no internal ids, no staff, no internal notes,
 *       no other guest and no other booking — only what the person standing at the desk would be told.</li>
 *   <li><b>It only ever shows.</b> There is no write on this path at all.</li>
 *   <li><b>Links expire and can be revoked</b>, and an unknown, expired and revoked token look alike.</li>
 * </ul>
 */
@Service
public class StayService {
    private static final SecureRandom RANDOM = new SecureRandom();
    /** How long after departure the link keeps working, so the guest can still fetch their bill on the train home. */
    private static final int DAYS_AFTER_DEPARTURE = 30;

    private final JdbcClient jdbc;
    private final JdbcClient adminJdbc;
    private final SettingsService settings;
    private final StorageProvider storage;
    private final AuditService audit;
    private final PmsProperties props;

    public StayService(@Qualifier("jdbc") JdbcClient jdbc, @Qualifier("adminJdbc") JdbcClient adminJdbc,
                       SettingsService settings, StorageProvider storage, AuditService audit, PmsProperties props) {
        this.jdbc = jdbc; this.adminJdbc = adminJdbc; this.settings = settings;
        this.storage = storage; this.audit = audit; this.props = props;
    }

    /** A link to hand the guest: the address, the same thing as a QR, and when it stops working. */
    public record Link(UUID id, String url, String qrDataUri, OffsetDateTime expiresAt) {}

    /** One receipt the guest may download. {@code url} is short-lived and absent until the PDF is rendered. */
    public record Bill(String number, String kind, String issuedAt, long amountPaise, String amount, String url) {}

    /**
     * Everything the guest's phone is told. Money is in paise and also preformatted, so the page never does
     * arithmetic on rupees. Notice what is missing: ids, staff, notes, and anything about the property's other
     * guests.
     */
    public record StayView(String propertyName, String propertyPhone, String propertyAddress, String language,
                           String reference, String guestName, String status,
                           String arrive, String depart, long nights, String checkinTime, String checkoutTime,
                           String roomType, String rooms, int adults, int children,
                           long totalPaise, long depositPaise, long paidPaise, long duePaise,
                           String total, String deposit, String paid, String due, List<Bill> bills) {}

    // ---------- Desk side ----------

    /**
     * Mint the guest's link for a booking. The desk does this to share or print a QR; the public booking page
     * does it for the guest who just booked online, with no user to attribute it to.
     *
     * <p>Minting is idempotent in the way that matters: asking again while a link is still live returns a new
     * token rather than reviving an old one, and both work, so a guest who kept the first message is not cut
     * off by the desk resending it.
     */
    @Transactional
    public Link create(UUID bookingId, UUID userId) {
        // A foreign key is checked without Row Level Security, so the booking is confirmed to be ours here.
        OffsetDateTime depart = jdbc.sql("select depart_at from bookings where id = ? and property_id = ?")
                .params(bookingId, TenantContext.require()).query(OffsetDateTime.class).optional()
                .orElseThrow(() -> new in.pms.common.NotFoundException("Booking"));

        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        OffsetDateTime expires = depart.plusDays(DAYS_AFTER_DEPARTURE);

        UUID id = jdbc.sql("""
                insert into stay_links(property_id, booking_id, token_hash, expires_at, created_by)
                values (?, ?, ?, ?, ?) returning id""")
                .params(TenantContext.require(), bookingId, sha256(token), expires, userId)
                .query(UUID.class).single();

        // Audited by hash, never in the clear: an audit row every manager can read must not contain a live key.
        audit.record("stay_links", id.toString(), "create",
                null, Map.of("bookingId", bookingId.toString(), "expiresAt", expires.toString()), userId);

        String url = url(token);
        return new Link(id, url, Qr.dataUri(url, 512), expires);
    }

    public String url(String token) { return props.appUrl().replaceAll("/+$", "") + "/s/" + token; }

    /** Stop a link working — the guest asked, or it went to the wrong phone. */
    @Transactional
    public void revoke(UUID id, UUID userId) {
        jdbc.sql("update stay_links set revoked_at = now() where id = ? and property_id = ? and revoked_at is null")
                .params(id, TenantContext.require()).update();
        audit.record("stay_links", id.toString(), "revoke", null, null, userId);
    }

    // ---------- Guest side: no session, the token is the credential ----------

    public record Resolved(UUID id, UUID propertyId, UUID bookingId) {}

    /**
     * Resolve a token to the one booking it names. Runs on the admin role because no tenant is known until it
     * returns.
     *
     * @return empty for a token that is unknown, expired or revoked; the three are indistinguishable on
     *         purpose, so probing cannot tell a real link from a guessed one.
     */
    @Transactional(value = "adminTx")
    public Optional<Resolved> resolve(String token) {
        if (token == null || token.length() < 20) return Optional.empty();
        var row = adminJdbc.sql("""
                select l.id, l.property_id, l.booking_id
                from stay_links l join properties p on p.id = l.property_id
                where l.token_hash = ? and l.expires_at > now() and l.revoked_at is null and p.active""")
                .param(sha256(token)).query().listOfRows().stream().findFirst();
        if (row.isEmpty()) return Optional.empty();
        var r = row.get();
        UUID id = (UUID) r.get("id");
        adminJdbc.sql("update stay_links set opens = opens + 1 where id = ?").param(id).update();
        return Optional.of(new Resolved(id, (UUID) r.get("property_id"), (UUID) r.get("booking_id")));
    }

    /**
     * What to show on the guest's phone. Every query is filtered by the booking the token names as well as by
     * the tenant, so a token can only ever read its own stay even if RLS were somehow not there.
     */
    @Transactional(readOnly = true)
    public StayView view(Resolved link) {
        UUID property = TenantContext.require();
        UUID bookingId = link.bookingId();
        var p = jdbc.sql("select name, phone, address, city, timezone from properties where id = ?")
                .param(property).query().singleRow();
        ZoneId zone = ZoneId.of((String) p.get("timezone"));

        var b = jdbc.sql("""
                select b.id, b.state::text as state, b.arrive_at, b.depart_at, b.adults, b.children, g.name as guest_name
                from bookings b join guests g on g.id = b.guest_id
                where b.id = ? and b.property_id = ?""")
                .params(bookingId, property).query().listOfRows().stream().findFirst()
                .orElseThrow(() -> new in.pms.common.NotFoundException("Stay"));

        LocalDate arrive = ts(b.get("arrive_at")).atZoneSameInstant(zone).toLocalDate();
        LocalDate depart = ts(b.get("depart_at")).atZoneSameInstant(zone).toLocalDate();

        String roomType = jdbc.sql("""
                select t.name from booking_units bu join rooms r on r.id = bu.room_id join room_types t on t.id = r.room_type_id
                where bu.booking_id = ? and bu.property_id = ? and bu.cancelled_at is null limit 1""")
                .params(bookingId, property).query(String.class).optional().orElse("");
        // Room numbers only once the guest is actually in them: before arrival an allocation is the desk's to change.
        String rooms = "checked_in".equals(b.get("state")) ? jdbc.sql("""
                select string_agg(r.number || case when bu.bed_id is not null then '/' || bd.label else '' end, ', ' order by r.number)
                from booking_units bu join rooms r on r.id = bu.room_id left join beds bd on bd.id = bu.bed_id
                where bu.booking_id = ? and bu.property_id = ? and bu.cancelled_at is null""")
                .params(bookingId, property).query(String.class).optional().orElse("") : "";

        var folio = jdbc.sql("select total_paise, paid_paise, deposit_held_paise from folios where booking_id = ? and property_id = ?")
                .params(bookingId, property).query().listOfRows().stream().findFirst().orElse(Map.of());
        // The desk's own arithmetic, shown the desk's own way: a deposit is money held, not a charge, so it
        // gets its own line. Without it the three numbers look like they do not add up, because they do not.
        long total = num(folio.get("total_paise"));
        long deposit = num(folio.get("deposit_held_paise"));
        long paid = num(folio.get("paid_paise"));
        // Signed on purpose: a negative balance means the property owes the guest, and rounding that up to
        // zero would hide a refund from the only person who would notice it.
        long due = total + deposit - paid;

        return new StayView((String) p.get("name"), (String) p.get("phone"), address(p), settings.current().guestLanguage(),
                reference(bookingId), (String) b.get("guest_name"), (String) b.get("state"),
                arrive.toString(), depart.toString(), ChronoUnit.DAYS.between(arrive, depart),
                settings.current().checkinTime().toString(), settings.current().checkoutTime().toString(),
                roomType, rooms == null ? "" : rooms, num(b.get("adults")).intValue(), num(b.get("children")).intValue(),
                total, deposit, paid, due,
                Money.format(total), Money.format(deposit), Money.format(paid), Money.format(Math.abs(due)),
                bills(bookingId, property));
    }

    /** The guest's own receipts, newest first, each with a short-lived download link when the PDF exists. */
    private List<Bill> bills(UUID bookingId, UUID property) {
        return jdbc.sql("""
                select r.number, r.kind::text as kind, r.issued_at, r.amount_paise, r.pdf_key
                from receipts r join folios f on f.id = r.folio_id
                where f.booking_id = ? and r.property_id = ? order by r.issued_at desc""")
                .params(bookingId, property).query().listOfRows().stream()
                .map(r -> new Bill((String) r.get("number"), (String) r.get("kind"),
                        ts(r.get("issued_at")).toString(), num(r.get("amount_paise")),
                        Money.format(num(r.get("amount_paise"))),
                        r.get("pdf_key") == null ? null : storage.signedGetUrl((String) r.get("pdf_key"), Duration.ofMinutes(15))))
                .toList();
    }

    /** The same short reference the booking page and the desk read out over the phone. */
    public static String reference(UUID bookingId) { return bookingId.toString().substring(0, 8).toUpperCase(); }

    private static String address(Map<String, Object> p) {
        String a = (String) p.get("address"), c = (String) p.get("city");
        return (a == null || a.isBlank()) ? (c == null ? "" : c) : (c == null || c.isBlank() ? a : a + ", " + c);
    }

    private static Long num(Object o) { return o instanceof Number n ? n.longValue() : 0L; }

    /** A row read untyped hands back {@link java.sql.Timestamp}; the property's own zone is applied afterwards. */
    private static OffsetDateTime ts(Object o) {
        return o instanceof java.sql.Timestamp t ? t.toInstant().atOffset(java.time.ZoneOffset.UTC) : (OffsetDateTime) o;
    }

    static String sha256(String s) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(java.nio.charset.StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
}
