package in.pms.selfreg;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.pms.audit.AuditService;
import in.pms.common.BadRequestException;
import in.pms.common.ForbiddenException;
import in.pms.common.NotFoundException;
import in.pms.config.PmsProperties;
import in.pms.guests.GuestService;
import in.pms.integrations.storage.StorageProvider;
import in.pms.print.Qr;
import in.pms.settings.Settings;
import in.pms.settings.SettingsService;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.*;

/**
 * Guest self-registration: the desk shows a QR code, the guest fills the register on their own phone.
 *
 * <p>This is the only part of the system a stranger can reach without signing in, so it is built to be
 * safe when the token is treated as public knowledge:
 *
 * <ul>
 *   <li><b>The token is the whole credential and is never stored.</b> 256 random bits, kept as a SHA-256
 *       hash exactly as login sessions are, so a database leak yields no working links.</li>
 *   <li><b>Reading a link tells you nothing.</b> The form returns the property's name and which fields to
 *       ask for — never the guest, the booking, the room or the bill. Guessing a token wins no data.</li>
 *   <li><b>Writing touches nothing that exists.</b> A submission lands in {@code guest_registrations} as
 *       inert JSON. It is the desk, signed in, who copies it onto a guest record. A stranger cannot alter
 *       a guest, a booking or a folio, only leave something for a human to look at and reject.</li>
 *   <li><b>Links expire and work once</b>, and the desk can revoke one at any time.</li>
 *   <li><b>A token names its own property.</b> It is resolved on the admin role, because no tenant is known
 *       before it is read; everything after runs inside that property's tenant context, so Row Level
 *       Security still decides what the write can touch.</li>
 * </ul>
 */
@Service
public class SelfRegistrationService {
    private static final SecureRandom RANDOM = new SecureRandom();
    /** A guest's own details and travelling companions; anything larger is not a person filling a form. */
    private static final int MAX_MEMBERS = 20;

    private final JdbcClient jdbc;
    private final JdbcClient adminJdbc;
    private final SettingsService settings;
    private final GuestService guests;
    private final StorageProvider storage;
    private final AuditService audit;
    private final PmsProperties props;
    private final ObjectMapper json;

    public SelfRegistrationService(@Qualifier("jdbc") JdbcClient jdbc, @Qualifier("adminJdbc") JdbcClient adminJdbc,
                                   SettingsService settings, GuestService guests, StorageProvider storage,
                                   AuditService audit, PmsProperties props, ObjectMapper json) {
        this.jdbc = jdbc; this.adminJdbc = adminJdbc; this.settings = settings; this.guests = guests;
        this.storage = storage; this.audit = audit; this.props = props; this.json = json;
    }

    // ---------- What the desk gets ----------

    /** A freshly minted link: the URL to open, the same thing as a QR image, and when it dies. */
    public record NewLink(UUID id, String url, String qrDataUri, OffsetDateTime expiresAt) {}

    /** What the guest's phone is told when it opens the form. Deliberately free of anyone's personal data. */
    public record GuestForm(String propertyName, String language, boolean askPhoto, boolean askConsent,
                            String consentText, boolean alreadyDone) {}

    /**
     * The live check-in, as the guest's phone sees it: their own draft and nothing else. No property id, no
     * booking, no room, no amount, no other guest — the same rule the form endpoint follows.
     */
    public record Session(String state, String status, int version, Map<String, Object> draft,
                          Map<String, Object> ocr, boolean hasIdPhoto, OffsetDateTime expiresAt) {}

    /**
     * A field-level write of the shared draft, from either side.
     *
     * @param fields only the fields whose value changed; everything else in the draft is left alone
     * @param ocr    what a document read suggests, with its confidence. Merged into the suggestions, never
     *               into the draft: a suggestion is offered to a human, not written over their typing
     * @param status what the desk's status line should say ("filling", "reading_id", ...)
     */
    public record Patch(Map<String, Object> fields, Map<String, Object> ocr, String status) {}

    // ---------- Desk side ----------

    /**
     * Mint a link for the guest to fill in. Tied to a booking when the desk already made one (an advance
     * booking whose guest is filling details before arriving), or loose for a walk-in standing at the desk.
     */
    @Transactional
    public NewLink create(UUID bookingId, UUID userId) {
        Settings s = settings.current();
        if (!s.selfRegistrationEnabled()) throw new ForbiddenException("Guest self-registration is switched off for this property");

        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        OffsetDateTime expires = OffsetDateTime.now().plusMinutes(s.selfRegistrationMinutes());
        // A foreign key is checked without Row Level Security, so the booking is confirmed to be this property's here.
        if (bookingId != null && jdbc.sql("select count(*) from bookings where id = ? and property_id = ?").params(bookingId, TenantContext.require()).query(Integer.class).single() == 0)
            throw new in.pms.common.NotFoundException("Booking");

        UUID id = jdbc.sql("""
                insert into guest_registrations(property_id, booking_id, token_hash, expires_at, created_by)
                values (?, ?, ?, ?, ?) returning id""")
                .params(TenantContext.require(), bookingId, sha256(token), expires, userId)
                .query(UUID.class).single();

        // The token is audited by its hash, never in the clear: an audit row is readable by every manager,
        // and a live link sitting in one would be a working key to the form.
        audit.record("guest_registrations", id.toString(), "create",
                null, Map.of("bookingId", String.valueOf(bookingId), "expiresAt", expires.toString()), userId);

        String url = props.appUrl().replaceAll("/+$", "") + "/g/" + token;
        return new NewLink(id, url, Qr.dataUri(url, 512), expires);
    }

    /** The desk polls this while the QR is on screen, to notice the moment the guest presses send. */
    @Transactional(readOnly = true)
    public SelfRegistration get(UUID id) {
        return jdbc.sql("select * from guest_registrations where id = ? and property_id = ?")
                .params(id, TenantContext.require()).query(this::map).optional()
                .orElseThrow(() -> new NotFoundException("Registration link"));
    }

    /** Stop a link working — the guest walked off, or the desk showed the QR to the wrong person. */
    @Transactional
    public SelfRegistration revoke(UUID id, UUID userId) {
        jdbc.sql("update guest_registrations set state = 'revoked' where id = ? and property_id = ? and state in ('open', 'submitted')")
                .params(id, TenantContext.require()).update();
        audit.record("guest_registrations", id.toString(), "revoke", null, null, userId);
        return get(id);
    }

    /** Apply a submission exactly as the guest typed it. */
    @Transactional
    public UUID apply(UUID id, UUID userId) { return apply(id, null, userId); }

    /**
     * Copy a submission onto a real guest record, which is the first moment anything the guest typed leaves
     * the quarantine of {@code guest_registrations}. Runs the same validation as the desk's own form, so a
     * full Aadhaar number is refused here exactly as it is there.
     *
     * @param corrected the desk's version of the details when it fixed something on screen before saving;
     *                  null keeps the guest's own words. The guest's ID photo comes along either way.
     */
    @Transactional
    public UUID apply(UUID id, GuestService.GuestInput corrected, UUID userId) {
        SelfRegistration reg = get(id);
        // The desk's own corrected copy stands in for a submission: it is the draft on their screen, which
        // the guest filled in field by field. Without one, there must be something the guest actually sent.
        if (reg.submitted() == null && corrected == null) throw new BadRequestException("The guest has not filled the form yet");
        if ("applied".equals(reg.state())) throw new BadRequestException("These details have already been saved");

        var in = reg.submitted();
        var input = corrected != null ? corrected : new GuestService.GuestInput(in.name(), in.phone(), in.city(),
                in.address(), in.nationality(), in.idType(), in.idLast4(), in.passportNo(), null, null, "");
        UUID guestId = guests.create(input, userId).id();

        String photoKey = jdbc.sql("select id_photo_key from guest_registrations where id = ? and property_id = ?")
                .params(id, TenantContext.require()).query(String.class).optional().orElse(null);
        if (photoKey != null)
            jdbc.sql("update guests set id_photo_key = ?, updated_at = now() where id = ? and property_id = ?")
                    .params(photoKey, guestId, TenantContext.require()).update();

        jdbc.sql("update guest_registrations set state = 'applied', applied_guest_id = ?, applied_at = now() where id = ? and property_id = ?")
                .params(guestId, id, TenantContext.require()).update();
        audit.record("guest_registrations", id.toString(), "apply", null, Map.of("guestId", guestId.toString()), userId);
        return guestId;
    }

    // ---------- Guest side: no session, the token is the credential ----------

    /**
     * Resolve a token to the property it belongs to. Runs on the admin role because no tenant is known until
     * this returns — the same reason login sessions do. Every caller then works inside that property.
     *
     * @return empty for a token that is unknown, expired or revoked; the three are indistinguishable to the
     *         caller on purpose, so probing cannot tell a real link from a guessed one.
     */
    @Transactional(value = "adminTx")
    public Optional<Resolved> resolve(String token) {
        if (token == null || token.length() < 20) return Optional.empty();
        var row = adminJdbc.sql("""
                select r.id, r.property_id, r.state, r.booking_id, p.name as property_name
                from guest_registrations r join properties p on p.id = r.property_id
                where r.token_hash = ? and r.expires_at > now() and r.state <> 'revoked' and p.active""")
                .param(sha256(token)).query().listOfRows().stream().findFirst();
        if (row.isEmpty()) return Optional.empty();
        var r = row.get();
        UUID id = (UUID) r.get("id");
        adminJdbc.sql("update guest_registrations set opens = opens + 1 where id = ?").param(id).update();
        return Optional.of(new Resolved(id, (UUID) r.get("property_id"), (String) r.get("property_name"), (String) r.get("state")));
    }

    public record Resolved(UUID id, UUID propertyId, String propertyName, String state) {}

    /** What to show on the guest's phone. Contains nothing about any guest, booking, room or bill. */
    @Transactional(readOnly = true)
    public GuestForm form(Resolved link) {
        Settings s = settings.current();
        String language = s.guestLanguage();
        return new GuestForm(link.propertyName(), language, s.selfRegistrationPhoto(), s.consentRequired(),
                s.consentText().getOrDefault(language, ""), !"open".equals(link.state()));
    }

    /**
     * Accept what the guest typed. It is stored verbatim as JSON and nothing else in the database moves:
     * no guest row, no booking, no folio. The desk applies it later, signed in and looking at it.
     */
    @Transactional
    public void submit(Resolved link, SelfRegistration.Submission in) {
        if (!"open".equals(link.state())) throw new BadRequestException("These details have already been sent");
        Settings s = settings.current();

        SelfRegistration.Submission clean = validate(in, s);
        int changed = jdbc.sql("""
                update guest_registrations set submitted = ?::jsonb, submitted_at = now(), state = 'submitted'
                where id = ? and property_id = ? and state = 'open'""")
                .params(toJson(clean), link.id(), TenantContext.require()).update();
        // A second phone posting the same link at the same time loses the race rather than overwriting.
        if (changed == 0) throw new BadRequestException("These details have already been sent");

        // The draft is the one copy both screens read, so the final answers land in it as well: the desk's
        // form shows what was sent, not the last keystroke before the guest pressed the button.
        writeDraft(link.id(), new Patch(json.convertValue(clean, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {}), null, "submitted"), "guest", null);

        // Attributed to no user, because no user did it. The desk sees it as a self-registration.
        audit.record("guest_registrations", link.id().toString(), "guest_submit", null, Map.of("name", clean.name()), null);
    }

    /** The guest photographing their own ID. Same type and size limits as the desk's own upload. */
    @Transactional
    public void storePhoto(Resolved link, InputStream data, long length, String contentType) {
        Settings s = settings.current();
        if (!"open".equals(link.state())) throw new ForbiddenException("This form has already been sent");
        if (!s.selfRegistrationPhoto()) throw new ForbiddenException("This property does not ask guests for an ID photo");
        if (!Set.of("image/jpeg", "image/png", "image/webp").contains(contentType))
            throw new BadRequestException("The photo must be a JPEG, PNG or WebP image");
        if (length > s.idPhotoMaxKb() * 1024L * 2)
            throw new BadRequestException("That photo is too large; please try again");

        String ext = switch (contentType) { case "image/png" -> "png"; case "image/webp" -> "webp"; default -> "jpg"; };
        String key = TenantContext.require() + "/id-photos/self-" + link.id() + "-" + UUID.randomUUID() + "." + ext;
        String previous = jdbc.sql("select id_photo_key from guest_registrations where id = ? and property_id = ?")
                .params(link.id(), TenantContext.require()).query(String.class).optional().orElse(null);
        storage.put(key, in.pms.files.Uploads.checked(data, contentType), length, contentType);
        jdbc.sql("update guest_registrations set id_photo_key = ? where id = ? and property_id = ?")
                .params(key, link.id(), TenantContext.require()).update();
        if (previous != null) storage.delete(previous); // a retake replaces the photo; the first one is not kept
    }

    // ---------- The live draft: one row, two screens ----------

    /**
     * Merge a patch into the shared draft. Both sides come through here, which is why the owner's screen and
     * the guest's phone can never disagree about what a field is called or how long it may be.
     *
     * <p>The merge is done by Postgres with jsonb {@code ||}, so a write touches only the fields it names:
     * the desk correcting a name while the guest types their address cannot overwrite the address, and there
     * is no read-modify-write window in which a keystroke could be lost. Each write bumps
     * {@code draft_version}; the other side polls with the version it last saw, so it applies real changes
     * and ignores its own echo. When both sides do change the same field, the later write wins — and the
     * value it replaced is in the audit log rather than silently gone.
     *
     * @param source guest | owner | ocr, which is what the other screen labels the change
     */
    @Transactional
    public void writeDraft(UUID id, Patch patch, String source, UUID userId) {
        Map<String, Object> fields = CheckInFields.clean(patch == null ? null : patch.fields());
        Map<String, Object> ocr = CheckInFields.cleanOcr(patch == null ? null : patch.ocr());
        String status = CheckInFields.cleanStatus(patch == null ? null : patch.status());

        Map<String, Object> before = fields.isEmpty() ? Map.of() : readDraft(id);
        int changed = jdbc.sql("""
                update guest_registrations
                   set draft = draft || ?::jsonb,
                       ocr = coalesce(ocr, '{}'::jsonb) || ?::jsonb,
                       status = ?,
                       draft_version = draft_version + 1,
                       draft_updated_at = now(),
                       draft_source = ?,
                       guest_seen_at = case when ? then now() else guest_seen_at end
                 where id = ? and property_id = ?""")
                .params(toJson(fields), toJson(ocr), status == null ? statusOf(id) : status, source,
                        !"owner".equals(source), id, TenantContext.require())
                .update();
        if (changed == 0) throw new NotFoundException("Registration link");

        // What changed, who changed it, and the value it replaced where the value is safe to keep. A patch
        // that moved nothing is not worth a row: text fields are debounced, so empty patches do arrive.
        Map<String, Object> diff = CheckInFields.changes(before, fields);
        if (!diff.isEmpty())
            audit.record("guest_registrations", id.toString(), "draft_" + source, null, diff, userId);
    }

    /** The guest's phone asking what the session now holds — their own draft, including the desk's corrections. */
    @Transactional(readOnly = true)
    public Session session(UUID id) {
        var reg = get(id);
        return new Session(reg.state(), reg.status(), reg.version(), reg.draft(), reg.ocr(), reg.hasIdPhoto(), reg.expiresAt());
    }

    /** Note that the guest has the form open, so the desk's status line stops saying "waiting". */
    @Transactional
    public void seen(UUID id, String status) {
        jdbc.sql("""
                update guest_registrations set guest_seen_at = now(),
                       status = case when status = 'waiting' then ? else status end
                 where id = ? and property_id = ? and state = 'open'""")
                .params(CheckInFields.cleanStatus(status) == null ? "opened" : status, id, TenantContext.require()).update();
    }

    private Map<String, Object> readDraft(UUID id) {
        String raw = jdbc.sql("select draft from guest_registrations where id = ? and property_id = ?")
                .params(id, TenantContext.require()).query(String.class).optional().orElse(null);
        return fromJson(raw);
    }

    private String statusOf(UUID id) {
        return jdbc.sql("select status from guest_registrations where id = ? and property_id = ?")
                .params(id, TenantContext.require()).query(String.class).optional().orElse("waiting");
    }

    // ---------- Validation ----------

    /**
     * The guest is a stranger typing into a public form, so everything is bounded before it is stored.
     * Reuses the desk's own guest validation for the rules that matter to the register (a full Aadhaar
     * number is refused, a foreign guest needs a passport number), and caps every free-text field so the
     * row cannot be used to park arbitrary data in the database.
     */
    private SelfRegistration.Submission validate(SelfRegistration.Submission in, Settings s) {
        if (in == null) throw new BadRequestException("Nothing was filled in");
        if (s.consentRequired() && !in.consent()) throw new BadRequestException("Please agree to the notice before sending");

        // Runs the desk's rules and throws the same messages; the result is discarded because this is stored
        // as a submission, not as a guest.
        guests.validateForRegister(new GuestService.GuestInput(in.name(), in.phone(), in.city(), in.address(),
                in.nationality(), in.idType(), in.idLast4(), in.passportNo(), null, null, ""));

        List<SelfRegistration.Submission.Member> members = in.members() == null ? List.of() : in.members();
        if (members.size() > MAX_MEMBERS) throw new BadRequestException("Too many people on one form; please ask the desk");
        List<SelfRegistration.Submission.Member> cleanMembers = members.stream()
                .filter(m -> m != null && m.name() != null && !m.name().isBlank())
                .map(m -> new SelfRegistration.Submission.Member(cap(m.name(), 120), m.adult()))
                .toList();

        return new SelfRegistration.Submission(
                cap(in.name(), 120), cap(in.phone(), 20), cap(in.city(), 120), cap(in.address(), 300),
                cap(in.nationality(), 2), in.idType(), cap(in.idLast4(), 4), cap(in.passportNo(), 40),
                clamp(in.adults(), 1, 30), clamp(in.children(), 0, 30), cap(in.purpose(), 40),
                cleanMembers, in.consent(), in.whatsappOptIn());
    }

    private static String cap(String s, int max) {
        if (s == null) return null;
        String t = s.trim();
        return t.length() <= max ? t : t.substring(0, max);
    }

    private static int clamp(int v, int min, int max) { return Math.max(min, Math.min(max, v)); }

    // ---------- Plumbing ----------

    private SelfRegistration map(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
        String raw = rs.getString("submitted");
        SelfRegistration.Submission submitted = null;
        if (raw != null) {
            try { submitted = json.readValue(raw, SelfRegistration.Submission.class); }
            catch (Exception e) { throw new IllegalStateException("Unreadable self-registration payload", e); }
        }
        return new SelfRegistration(rs.getObject("id", UUID.class), rs.getString("state"), rs.getString("status"),
                rs.getInt("draft_version"), fromJson(rs.getString("draft")), fromJson(rs.getString("ocr")),
                rs.getObject("expires_at", OffsetDateTime.class), rs.getObject("submitted_at", OffsetDateTime.class),
                submitted, rs.getString("id_photo_key") != null);
    }

    private Map<String, Object> fromJson(String raw) {
        if (raw == null || raw.isBlank()) return Map.of();
        try { return json.readValue(raw, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {}); }
        catch (Exception e) { throw new IllegalStateException("Unreadable check-in draft", e); }
    }

    private String toJson(Object o) {
        try { return json.writeValueAsString(o); }
        catch (Exception e) { throw new IllegalStateException("Cannot serialise submission", e); }
    }

    static String sha256(String s) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(java.nio.charset.StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
}
