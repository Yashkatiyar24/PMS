package in.pms.settings;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.pms.audit.AuditService;
import in.pms.common.BadRequestException;
import in.pms.common.ForbiddenException;
import in.pms.tenant.TenantContext;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.*;

/**
 * Reads and updates {@code properties.settings} against the registry.
 * Stored values are validated on the way in and on the way out, so a bad row can never break a screen:
 * an invalid stored value simply falls back to its default.
 */
@Service
public class SettingsService {
    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {};

    private final JdbcClient jdbc;
    private final ObjectMapper json;
    private final AuditService audit;

    public SettingsService(@Qualifier("jdbc") JdbcClient jdbc, ObjectMapper json, AuditService audit) {
        this.jdbc = jdbc; this.json = json; this.audit = audit;
    }

    /** Resolved settings of the current tenant. */
    @Transactional(readOnly = true)
    public Settings current() {
        String raw = jdbc.sql("select settings::text from properties where id = ?").param(TenantContext.require()).query(String.class).single();
        return resolve(parse(raw));
    }

    /** Merge stored values over defaults, dropping anything invalid. */
    public static Settings resolve(Map<String, Object> stored) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (SettingDef def : SettingsRegistry.ALL) {
            Object v = stored == null ? null : stored.get(def.key());
            out.put(def.key(), v != null && validate(def, v).isEmpty() ? coerce(def, v) : def.defaultValue());
        }
        return new Settings(out);
    }

    /**
     * Apply a partial update. Each key is checked against the registry for existence, value shape and the
     * caller's role; the whole patch is rejected if any key fails. Writes one audit row with before/after.
     */
    @Transactional
    public Settings update(Map<String, Object> patch, SettingDef.Role callerRole, UUID userId) {
        Map<String, String> problems = new LinkedHashMap<>();
        Map<String, Object> clean = new LinkedHashMap<>();
        for (var e : patch.entrySet()) {
            SettingDef def = SettingsRegistry.find(e.getKey()).orElse(null);
            if (def == null) { problems.put(e.getKey(), "unknown setting"); continue; }
            if (!callerRole.atLeast(def.who())) throw new ForbiddenException("Only " + def.who().name().toLowerCase() + " may change " + def.key());
            if (e.getValue() == null) { clean.put(def.key(), null); continue; } // null = reset to default
            validate(def, e.getValue()).ifPresentOrElse(msg -> problems.put(def.key(), msg), () -> clean.put(def.key(), coerce(def, e.getValue())));
        }
        if (!problems.isEmpty()) throw new BadRequestException("Invalid settings: " + problems);

        UUID propertyId = TenantContext.require();
        Map<String, Object> before = parse(jdbc.sql("select settings::text from properties where id = ? for update").param(propertyId).query(String.class).single());
        Map<String, Object> after = new LinkedHashMap<>(before);
        clean.forEach((k, v) -> { if (v == null) after.remove(k); else after.put(k, v); });

        jdbc.sql("update properties set settings = ?::jsonb, updated_at = now() where id = ?").params(write(after), propertyId).update();
        audit.record("properties", propertyId.toString(), "settings", before, after, userId);
        return resolve(after);
    }

    /** Returns a problem message, or empty when the value fits the definition. */
    static Optional<String> validate(SettingDef def, Object v) {
        return switch (def.type()) {
            case BOOL -> v instanceof Boolean ? Optional.empty() : Optional.of("must be true or false");
            case INT -> {
                if (!(v instanceof Number n) || n.doubleValue() != Math.floor(n.doubleValue())) yield Optional.of("must be a whole number");
                long l = n.longValue();
                if (def.min() != null && l < def.min()) yield Optional.of("must be at least " + def.min());
                if (def.max() != null && l > def.max()) yield Optional.of("must be at most " + def.max());
                yield Optional.empty();
            }
            case TIME -> {
                if (!(v instanceof String s)) yield Optional.of("must be HH:MM");
                try { LocalTime.parse(s); yield Optional.empty(); } catch (DateTimeParseException ex) { yield Optional.of("must be HH:MM"); }
            }
            case ENUM -> v instanceof String s && def.options().contains(s) ? Optional.empty() : Optional.of("must be one of " + def.options());
            case TEXT -> {
                if (!(v instanceof String s)) yield Optional.of("must be text");
                if (def.maxLength() != null && s.length() > def.maxLength()) yield Optional.of("must be at most " + def.maxLength() + " characters");
                yield Optional.empty();
            }
            case LIST -> {
                if (!(v instanceof List<?> l)) yield Optional.of("must be a list");
                for (Object o : l) {
                    if (!(o instanceof String s)) yield Optional.of("must be a list of text");
                    if (def.options() != null && !def.options().contains(s)) yield Optional.of("must only contain " + def.options());
                }
                yield Optional.empty();
            }
            case I18N_TEXT -> {
                if (!(v instanceof Map<?, ?> m)) yield Optional.of("must be a map of language to text");
                for (var e : m.entrySet()) if (!(e.getKey() instanceof String) || !(e.getValue() instanceof String)) yield Optional.of("must be a map of language to text");
                yield Optional.empty();
            }
        };
    }

    /** Normalise JSON numbers so INT settings are always Integer/Long, never Double. */
    private static Object coerce(SettingDef def, Object v) {
        if (def.type() == SettingDef.Type.INT && v instanceof Number n) return n.longValue() > Integer.MAX_VALUE ? n.longValue() : n.intValue();
        return v;
    }

    private Map<String, Object> parse(String raw) {
        try { return raw == null ? new LinkedHashMap<>() : json.readValue(raw, MAP); }
        catch (Exception e) { throw new IllegalStateException("Corrupt settings JSON", e); }
    }

    private String write(Map<String, Object> m) {
        try { return json.writeValueAsString(m); } catch (Exception e) { throw new IllegalStateException(e); }
    }
}
