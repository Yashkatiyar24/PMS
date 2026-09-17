package in.pms.settings;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static in.pms.settings.SettingDef.Role.*;
import static in.pms.settings.SettingDef.*;

/**
 * The settings registry (PRD section 14). Every rule that differs between properties lives here with a
 * default; a behaviour that is not in this list is the same for every property. The settings screen is
 * generated from it, {@link SettingsService} validates against it, and {@link Settings} is the resolved view.
 */
public final class SettingsRegistry {
    private SettingsRegistry() {}

    public static final List<String> LANGUAGES = List.of("hi", "en");
    public static final List<String> PAYMENT_MODES = List.of("cash", "upi", "card", "bank", "cheque");
    public static final List<String> PRINTER_PROFILES = List.of("thermal_58", "thermal_80", "a4");
    public static final List<String> REGISTER_COLUMNS = List.of(
            "serial", "name", "address", "nationality", "id", "arrival", "departure", "unit",
            "adults", "children", "members", "purpose", "phone");

    public static final Map<String, String> GROUPS = Map.ofEntries(
            Map.entry("language", "Language"), Map.entry("stay", "Stay and billing"),
            Map.entry("reservations", "Reservations"), Map.entry("day", "Business day and reports"),
            Map.entry("people", "People and approvals"), Map.entry("guests", "Guests and compliance"),
            Map.entry("tax", "Tax"), Map.entry("receipts", "Receipts and printing"), Map.entry("money", "Money"),
            Map.entry("messaging", "Messaging"), Map.entry("platform", "Platform"));

    public static final List<SettingDef> ALL = List.of(
        // Language
        list("languages", "language", OWNER, List.of("hi", "en"), LANGUAGES, "Languages offered in the UI; the first is the default."),
        enumOf("guest_language", "language", MANAGER, "hi", LANGUAGES, "Language for guest-facing messages and receipts."),

        // Stay and billing
        time("checkin_time", "stay", MANAGER, "12:00", "Standard check-in time shown on confirmations."),
        time("checkout_time", "stay", MANAGER, "10:00", "Standard checkout time; used by night billing."),
        enumOf("billing_mode", "stay", OWNER, "night", List.of("night", "24h"), "Charge per night (fixed checkout time) or per 24 hours from arrival."),
        integer("late_grace_minutes", "stay", MANAGER, 60, 0, 720, "Minutes past checkout time before a late charge applies."),
        enumOf("late_checkout_policy", "stay", MANAGER, "half_day", List.of("none", "half_day", "full_day"), "What a late checkout beyond the grace period costs."),
        bool("day_use_allowed", "stay", MANAGER, true, "Allow same-day arrival and departure stays."),
        integer("day_use_rate_pct", "stay", MANAGER, 50, 0, 100, "Day-use charge as a percentage of the room rate."),
        bool("dorm_whole_room_allowed", "stay", OWNER, false, "Allow booking an entire dormitory room instead of individual beds."),
        integer("tape_chart_days", "stay", MANAGER, 14, 7, 60, "Days shown on the tape chart."),
        bool("dirty_rooms_assignable", "stay", MANAGER, true, "Allow assigning a dirty room (with a warning)."),

        // Reservations
        time("noshow_hour", "reservations", MANAGER, "18:00", "Reserved bookings not arrived by this time are flagged."),
        enumOf("noshow_policy", "reservations", OWNER, "forfeit", List.of("forfeit", "refund", "partial"), "What happens to the advance on a no-show."),
        integer("noshow_partial_pct", "reservations", OWNER, 50, 0, 100, "Percentage of the advance kept when the policy is partial."),

        // Business day and reports
        time("business_day_start", "day", OWNER, "21:00", "A business day runs from this hour to the same hour next day; the report is sent then."),
        enumOf("report_channel", "day", OWNER, "both", List.of("whatsapp", "email", "both"), "Where the daily report is sent."),

        // People and approvals
        enumOf("approval_mode", "people", OWNER, "pin", List.of("pin", "queue"), "How manager approval is given: PIN on the staff device, or a request queue."),
        enumOf("staff_edit_window", "people", OWNER, "business_day", List.of("business_day", "hours_24", "none"), "How far back staff may edit records."),
        integer("session_days", "people", OWNER, 30, 1, 365, "Days a login stays valid on a trusted device."),

        // Guests and compliance
        bool("id_photo_required", "guests", MANAGER, true, "Require an ID photo at check-in (skippable with a logged reason)."),
        integer("id_photo_max_kb", "guests", OWNER, 300, 50, 2000, "Client-side compression target for ID photos."),
        integer("id_photo_retention_days", "guests", OWNER, 730, 30, 3650, "Days after checkout before ID photos are purged."),
        bool("register_requires_all_names", "guests", MANAGER, true, "Require names of all adult members for the police register."),
        list("register_template", "guests", MANAGER, List.of("serial", "name", "address", "nationality", "id", "arrival", "departure", "unit", "adults", "children", "members", "purpose"), REGISTER_COLUMNS, "Columns and order of the police register export."),
        bool("consent_required", "guests", OWNER, true, "Show the consent notice at check-in."),
        bool("self_registration_enabled", "guests", MANAGER, true, "Let the desk show a QR code so the guest fills their own details on their own phone."),
        integer("self_registration_minutes", "guests", MANAGER, 30, 5, 240, "Minutes a self-registration QR code stays valid before it expires."),
        bool("self_registration_photo", "guests", MANAGER, true, "Ask the guest to photograph their own ID when they fill the form."),
        i18n("consent_text", "guests", OWNER, Map.of(
                "en", "Your details are collected for the guest register as required by law and to send your receipt. They are not shared for marketing.",
                "hi", "आपकी जानकारी कानून के अनुसार अतिथि रजिस्टर और रसीद भेजने के लिए ली जा रही है। इसे विपणन के लिए साझा नहीं किया जाएगा।"),
                "Consent notice shown at check-in."),

        // Tax
        bool("tax_exempt", "tax", OWNER, false, "Charge no GST regardless of slabs (confirm with your CA)."),
        bool("religious_precinct", "tax", OWNER, false, "Rooms inside a religious precinct run by a registered trust; enables the exemption threshold."),
        integer("exemption_threshold_paise", "tax", OWNER, 100000, 0, 100000000, "Per-day rate below which rooms are exempt when religious_precinct is on (confirm value with CA)."),
        bool("donation_mode", "tax", OWNER, false, "Issue donation receipts (80G) instead of invoices. Requires CA confirmation below."),
        bool("donation_mode_ca_confirmed", "tax", OWNER, false, "The trust's CA has confirmed donation receipts are appropriate."),

        // Receipts and printing
        text("receipt_prefix", "receipts", OWNER, "", 5, "Prefix for receipt numbers (max 5 characters)."),
        text("receipt_number_format", "receipts", OWNER, "{PREFIX}/{FY}/{SEQ:4}", 24, "Number pattern; total length must stay within 16 characters."),
        text("receipt_header", "receipts", MANAGER, "", 300, "Text printed at the top of receipts."),
        text("receipt_footer", "receipts", MANAGER, "", 300, "Text printed at the bottom of receipts."),
        text("receipt_terms", "receipts", MANAGER, "", 500, "Terms printed on invoices."),
        text("receipt_logo_key", "receipts", MANAGER, "", 200, "Storage key of the logo image."),
        enumOf("offline_receipt_mode", "receipts", OWNER, "provisional", List.of("provisional", "device_block"), "How receipts are numbered when a device is offline."),
        integer("offline_block_size", "receipts", OWNER, 20, 5, 200, "Numbers each device reserves in device_block mode."),
        integer("offline_cache_days", "receipts", OWNER, 7, 1, 30, "Days of bookings cached on the device for offline use."),
        enumOf("printer_profile", "receipts", MANAGER, "thermal_58", PRINTER_PROFILES, "Paper size template used for printing."),

        // Money
        text("upi_vpa", "money", OWNER, "", 100, "UPI ID shown as a QR on screen and receipts."),
        text("upi_payee_name", "money", OWNER, "", 100, "Payee name for the UPI QR."),
        list("payment_modes", "money", MANAGER, PAYMENT_MODES, PAYMENT_MODES, "Payment modes offered at the desk."),
        integer("deposit_default_paise", "money", MANAGER, 0, 0, 10000000, "Default refundable deposit suggested at check-in."),

        // Messaging
        bool("whatsapp_enabled", "messaging", OWNER, true, "Send WhatsApp messages from this property."),
        bool("push_enabled", "messaging", OWNER, true, "Send push notifications to staff devices."),

        // Platform
        text("support_access_until", "platform", OWNER, "", 40, "ISO timestamp until which our support may view guest data."),
        integer("org_data_retention_days", "platform", SUPER_ADMIN, 90, 30, 3650, "Days after a property leaves before its data is deleted."),
        integer("grace_banner_days", "platform", SUPER_ADMIN, 15, 0, 365, "Days unpaid before a billing banner shows."),
        integer("grace_readonly_days", "platform", SUPER_ADMIN, 45, 0, 365, "Days unpaid before the property becomes read-only.")
    );

    private static final Map<String, SettingDef> BY_KEY = ALL.stream().collect(java.util.stream.Collectors.toUnmodifiableMap(SettingDef::key, d -> d));

    public static Optional<SettingDef> find(String key) { return Optional.ofNullable(BY_KEY.get(key)); }
}
