package in.pms.settings;

import java.util.List;
import java.util.Map;

/**
 * One row of the settings registry (PRD section 14).
 *
 * @param key         the JSON key in {@code properties.settings}
 * @param group       UI grouping
 * @param type        value type, drives validation and the settings screen
 * @param defaultValue value used when the property has not set the key
 * @param who         lowest role that may change it
 * @param options     allowed values for ENUM and LIST types
 * @param min         lower bound for INT
 * @param max         upper bound for INT
 * @param maxLength   upper bound for TEXT
 * @param description shown to the owner on the settings screen
 */
public record SettingDef(
        String key,
        String group,
        Type type,
        Object defaultValue,
        Role who,
        List<String> options,
        Integer min,
        Integer max,
        Integer maxLength,
        String description
) {
    public enum Type { BOOL, INT, TIME, ENUM, TEXT, LIST, I18N_TEXT }
    /** Ordered from least to most privileged; {@link #atLeast} compares. */
    public enum Role { MANAGER, OWNER, SUPER_ADMIN;
        public boolean atLeast(Role other) { return ordinal() >= other.ordinal(); }
    }

    static SettingDef bool(String key, String group, Role who, boolean def, String desc) { return new SettingDef(key, group, Type.BOOL, def, who, null, null, null, null, desc); }
    static SettingDef integer(String key, String group, Role who, int def, int min, int max, String desc) { return new SettingDef(key, group, Type.INT, def, who, null, min, max, null, desc); }
    static SettingDef time(String key, String group, Role who, String def, String desc) { return new SettingDef(key, group, Type.TIME, def, who, null, null, null, null, desc); }
    static SettingDef enumOf(String key, String group, Role who, String def, List<String> options, String desc) { return new SettingDef(key, group, Type.ENUM, def, who, options, null, null, null, desc); }
    static SettingDef text(String key, String group, Role who, String def, int maxLength, String desc) { return new SettingDef(key, group, Type.TEXT, def, who, null, null, null, maxLength, desc); }
    static SettingDef list(String key, String group, Role who, List<String> def, List<String> options, String desc) { return new SettingDef(key, group, Type.LIST, def, who, options, null, null, null, desc); }
    static SettingDef i18n(String key, String group, Role who, Map<String, String> def, String desc) { return new SettingDef(key, group, Type.I18N_TEXT, def, who, null, null, null, null, desc); }
}
