package in.pms.settings;

import java.time.LocalTime;
import java.util.List;
import java.util.Map;

/**
 * Resolved settings for one property: stored values merged over registry defaults.
 * Typed accessors keep the rest of the code free of string keys.
 */
public final class Settings {
    private final Map<String, Object> values;

    Settings(Map<String, Object> values) { this.values = values; }

    public Map<String, Object> asMap() { return values; }

    private String str(String k) { return String.valueOf(values.get(k)); }
    private boolean bool(String k) { return Boolean.TRUE.equals(values.get(k)); }
    private int integer(String k) { return ((Number) values.get(k)).intValue(); }
    private long longValue(String k) { return ((Number) values.get(k)).longValue(); }
    private LocalTime time(String k) { return LocalTime.parse(str(k)); }
    @SuppressWarnings("unchecked") private List<String> list(String k) { return (List<String>) values.get(k); }
    @SuppressWarnings("unchecked") private Map<String, String> i18n(String k) { return (Map<String, String>) values.get(k); }

    public List<String> languages() { return list("languages"); }
    public String guestLanguage() { return str("guest_language"); }

    public LocalTime checkinTime() { return time("checkin_time"); }
    public LocalTime checkoutTime() { return time("checkout_time"); }
    public String billingMode() { return str("billing_mode"); }
    public int lateGraceMinutes() { return integer("late_grace_minutes"); }
    public String lateCheckoutPolicy() { return str("late_checkout_policy"); }
    public boolean dayUseAllowed() { return bool("day_use_allowed"); }
    public int dayUseRatePct() { return integer("day_use_rate_pct"); }
    public boolean dormWholeRoomAllowed() { return bool("dorm_whole_room_allowed"); }
    public int tapeChartDays() { return integer("tape_chart_days"); }
    public boolean dirtyRoomsAssignable() { return bool("dirty_rooms_assignable"); }

    public LocalTime noshowHour() { return time("noshow_hour"); }
    public String noshowPolicy() { return str("noshow_policy"); }
    public int noshowPartialPct() { return integer("noshow_partial_pct"); }
    public int tentativeHoldHours() { return integer("tentative_hold_hours"); }

    public LocalTime businessDayStart() { return time("business_day_start"); }
    public String reportChannel() { return str("report_channel"); }

    public String approvalMode() { return str("approval_mode"); }
    public String staffEditWindow() { return str("staff_edit_window"); }
    public int sessionDays() { return integer("session_days"); }

    public boolean idPhotoRequired() { return bool("id_photo_required"); }
    public int idPhotoMaxKb() { return integer("id_photo_max_kb"); }
    public int idPhotoRetentionDays() { return integer("id_photo_retention_days"); }
    public boolean registerRequiresAllNames() { return bool("register_requires_all_names"); }
    public List<String> registerTemplate() { return list("register_template"); }
    public boolean consentRequired() { return bool("consent_required"); }
    public boolean selfRegistrationEnabled() { return bool("self_registration_enabled"); }
    public int selfRegistrationMinutes() { return integer("self_registration_minutes"); }
    public boolean selfRegistrationPhoto() { return bool("self_registration_photo"); }
    public Map<String, String> consentText() { return i18n("consent_text"); }

    public boolean onlineBookingEnabled() { return bool("online_booking_enabled"); }
    public int onlineBookingMaxNights() { return integer("online_booking_max_nights"); }
    public int onlineBookingDaysAhead() { return integer("online_booking_days_ahead"); }
    public String onlinePayment() { return str("online_payment"); }
    public int onlinePaymentAdvancePct() { return integer("online_payment_advance_pct"); }
    public int onlinePaymentHoldMinutes() { return integer("online_payment_hold_minutes"); }

    public boolean taxExempt() { return bool("tax_exempt"); }
    public boolean religiousPrecinct() { return bool("religious_precinct"); }
    public long exemptionThresholdPaise() { return longValue("exemption_threshold_paise"); }
    public boolean donationMode() { return bool("donation_mode") && bool("donation_mode_ca_confirmed"); }
    public boolean ratesIncludeTax() { return bool("rates_include_tax"); }
    public int restaurantTaxBp() { return integer("restaurant_tax_bp"); }
    public boolean igstForInterstateB2b() { return bool("igst_for_interstate_b2b"); }

    public String receiptPrefix() { return str("receipt_prefix"); }
    public String receiptNumberFormat() { return str("receipt_number_format"); }
    public String receiptHeader() { return str("receipt_header"); }
    public String receiptFooter() { return str("receipt_footer"); }
    public String receiptTerms() { return str("receipt_terms"); }
    public String receiptLogoKey() { return str("receipt_logo_key"); }
    public String offlineReceiptMode() { return str("offline_receipt_mode"); }
    public int offlineBlockSize() { return integer("offline_block_size"); }
    public int offlineCacheDays() { return integer("offline_cache_days"); }
    public String printerProfile() { return str("printer_profile"); }

    public String upiVpa() { return str("upi_vpa"); }
    public String upiPayeeName() { return str("upi_payee_name"); }
    public List<String> paymentModes() { return list("payment_modes"); }
    public long depositDefaultPaise() { return longValue("deposit_default_paise"); }

    public boolean whatsappEnabled() { return bool("whatsapp_enabled"); }
    /** The newer guest messages, sent only once their templates are approved. */
    public boolean whatsappGuestUpdates() { return whatsappEnabled() && bool("whatsapp_guest_updates"); }
    public boolean pushEnabled() { return bool("push_enabled"); }
    public int checkoutReminderMinutes() { return integer("checkout_reminder_minutes"); }

    public String supportAccessUntil() { return str("support_access_until"); }
    public int orgDataRetentionDays() { return integer("org_data_retention_days"); }
    public int graceBannerDays() { return integer("grace_banner_days"); }
    public int graceReadonlyDays() { return integer("grace_readonly_days"); }
}
