package in.pms.selfreg;

import in.pms.common.BadRequestException;

import java.util.*;
import java.util.regex.Pattern;

/**
 * The one list of questions a check-in asks.
 *
 * <p>The desk's screen, the guest's phone and the document reader all write into the same draft, so they all
 * come through here. A field that is not named below cannot be written from any of them, which is what stops
 * the three views drifting apart — and what stops a stranger with a token parking arbitrary data in the row.
 *
 * <p>Everything is bounded: text is capped, numbers are clamped, enums are checked, and any text carrying a
 * twelve-digit run is refused outright, exactly as the desk's own guest form refuses it. The register keeps
 * the last four digits of a document and nothing more.
 */
public final class CheckInFields {
    private CheckInFields() {}

    /** A full Aadhaar number, however it is spaced. Never stored, from either side. */
    private static final Pattern TWELVE_DIGITS = Pattern.compile("(?:\\d[^\\S\\n]*){12}");

    /** Free text, and the longest it may be. The caps match the guest record's own columns. */
    private static final Map<String, Integer> TEXT = Map.ofEntries(
            Map.entry("name", 120), Map.entry("phone", 20), Map.entry("email", 160),
            Map.entry("city", 120), Map.entry("address", 300), Map.entry("state", 60),
            Map.entry("pincode", 10), Map.entry("country", 60), Map.entry("nationality", 2),
            Map.entry("idType", 20), Map.entry("idLast4", 4), Map.entry("passportNo", 40),
            Map.entry("dob", 10), Map.entry("gender", 12), Map.entry("purpose", 40));

    private static final Set<String> FLAGS = Set.of("consent", "whatsappOptIn");
    private static final Set<String> ID_TYPES = Set.of("aadhaar", "voter", "dl", "passport", "other", "pan");
    private static final Set<String> GENDERS = Set.of("", "male", "female", "other");
    /** A guest and their travelling companions; anything larger is not a person filling a form. */
    static final int MAX_MEMBERS = 20;
    /** What the desk's status line may say. Mirrors the database's own CHECK. */
    static final Set<String> STATUSES = Set.of("waiting", "opened", "filling", "reading_id", "submitted");

    /** Fields the audit log keeps the values of. The rest are recorded as having changed, without the value. */
    private static final Set<String> AUDITABLE = Set.of("name", "phone", "city", "state", "country",
            "nationality", "idType", "purpose", "adults", "children", "consent", "whatsappOptIn");

    /**
     * Everything a check-in may be asked, in the order the screens show it. Exported so the field list has
     * exactly one home; the browser's copy is checked against this by {@code SelfRegistrationTest}.
     */
    public static List<String> all() {
        return List.of("name", "phone", "email", "dob", "gender", "address", "city",
                "state", "pincode", "country", "nationality", "idType", "idLast4", "passportNo",
                "adults", "children", "purpose", "members", "consent", "whatsappOptIn");
    }

    /**
     * A patch of the draft, bounded and stripped of anything not asked for.
     *
     * @throws BadRequestException for a value that cannot be made safe rather than quietly dropped — a full
     *         Aadhaar number, an unknown ID type, a flood of companions.
     */
    public static Map<String, Object> clean(Map<String, Object> in) {
        if (in == null || in.isEmpty()) return Map.of();
        var out = new LinkedHashMap<String, Object>();
        for (var e : in.entrySet()) {
            String key = e.getKey();
            Object v = e.getValue();
            Integer cap = TEXT.get(key);
            if (cap != null) {
                out.put(key, text(key, v, cap));
            } else if (key.equals("adults")) {
                out.put(key, clamp(v, 1, 30));
            } else if (key.equals("children")) {
                out.put(key, clamp(v, 0, 30));
            } else if (FLAGS.contains(key)) {
                out.put(key, Boolean.TRUE.equals(v) || "true".equals(String.valueOf(v)));
            } else if (key.equals("members")) {
                out.put(key, members(v));
            }
            // Anything else is not a question this register asks, and is dropped without complaint: an older
            // phone sending a field a newer one has stopped asking must not fail the whole patch.
        }
        return out;
    }

    /** What a document read suggests: {field: {value, confidence}}, plus a free-form {@code _doc} note. */
    public static Map<String, Object> cleanOcr(Map<String, Object> in) {
        if (in == null || in.isEmpty()) return Map.of();
        var out = new LinkedHashMap<String, Object>();
        for (var e : in.entrySet()) {
            String key = e.getKey();
            if (key.equals("_doc")) {
                out.put(key, text("_doc", e.getValue(), 40));
                continue;
            }
            Integer cap = TEXT.get(key);
            if (cap == null || !(e.getValue() instanceof Map<?, ?> m)) continue;
            String value = text(key, m.get("value"), cap);
            if (value == null || value.isBlank()) continue;
            // Two decimals: a reader's confidence is a rough thing, and a full double prints sixteen digits
            // into the row for no gain.
            double confidence = m.get("confidence") instanceof Number n
                    ? Math.round(Math.max(0, Math.min(1, n.doubleValue())) * 100) / 100.0 : 0;
            out.put(key, Map.of("value", value, "confidence", confidence));
        }
        return out;
    }

    /** The status a guest's phone may claim. An unknown one is ignored rather than refused. */
    public static String cleanStatus(String status) {
        return status != null && STATUSES.contains(status) ? status : null;
    }

    /**
     * What changed, for the audit log: the field, and its old and new value where the value is not something
     * the log should hold. A document's last four digits, a passport number, a date of birth and an address
     * are recorded as having changed and nothing more — an audit row is readable by every manager.
     */
    public static Map<String, Object> changes(Map<String, Object> before, Map<String, Object> patch) {
        var out = new LinkedHashMap<String, Object>();
        for (var e : patch.entrySet()) {
            Object old = before == null ? null : before.get(e.getKey());
            if (Objects.equals(old, e.getValue())) continue;
            out.put(e.getKey(), AUDITABLE.contains(e.getKey())
                    ? Map.of("from", String.valueOf(old), "to", String.valueOf(e.getValue()))
                    : "changed");
        }
        return out;
    }

    // ---------- bounding ----------

    private static String text(String key, Object v, int cap) {
        if (v == null) return "";
        String s = String.valueOf(v).trim();
        if (TWELVE_DIGITS.matcher(s).find())
            throw new BadRequestException("Do not enter a full Aadhaar number; only the last 4 digits");
        if (s.length() > cap) s = s.substring(0, cap);
        if (key.equals("idType") && !s.isEmpty() && !ID_TYPES.contains(s)) throw new BadRequestException("Unknown ID type");
        if (key.equals("gender") && !GENDERS.contains(s.toLowerCase())) return "";
        if (key.equals("dob") && !s.isEmpty() && !s.matches("\\d{4}-\\d{2}-\\d{2}")) return "";
        if (key.equals("pincode") && !s.isEmpty() && !s.matches("\\d{4,10}")) return "";
        if (key.equals("phone")) return phone(s);
        return s;
    }

    /**
     * Ten digits, the way the guest record stores them. A country code or a trunk zero in front of a full
     * number is dropped and anything past the tenth digit with it, so a number typed on a phone, pasted from
     * a contact or read off a document all end up as the same thing — and as the thing the screens show.
     */
    private static String phone(String raw) {
        String digits = raw.replaceAll("\\D", "");
        while (digits.length() > 10 && (digits.startsWith("91") || digits.startsWith("0")))
            digits = digits.startsWith("91") ? digits.substring(2) : digits.substring(1);
        return digits.length() > 10 ? digits.substring(0, 10) : digits;
    }

    private static int clamp(Object v, int min, int max) {
        int n = min;
        if (v instanceof Number num) n = num.intValue();
        else try { n = Integer.parseInt(String.valueOf(v).trim()); }
        catch (NumberFormatException ignored) { /* an unreadable count means the smallest allowed */ }
        return Math.max(min, Math.min(max, n));
    }

    private static List<Map<String, Object>> members(Object v) {
        if (!(v instanceof List<?> list)) return List.of();
        if (list.size() > MAX_MEMBERS) throw new BadRequestException("Too many people on one form; please ask the desk");
        var out = new ArrayList<Map<String, Object>>();
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> m)) continue;
            String name = text("name", m.get("name"), 120);
            if (name.isBlank()) continue;
            out.add(Map.of("name", name, "adult", !Boolean.FALSE.equals(m.get("adult"))));
        }
        return out;
    }
}
