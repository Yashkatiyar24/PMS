package in.pms.print;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Printed labels in Hindi and English. Receipts show both languages, because the guest reads Hindi and the
 * accountant reads English. Adding a language is one more map here and one entry in {@code languages}.
 */
public final class Labels {
    private Labels() {}

    private static final Map<String, String[]> LABELS = new LinkedHashMap<>(); // key -> { en, hi }
    static {
        put("invoice", "Tax Invoice", "कर बीजक");
        put("donation", "Donation Receipt", "दान रसीद");
        put("credit_note", "Credit Note", "क्रेडिट नोट");
        put("provisional", "Receipt", "रसीद");
        put("number", "No.", "सं.");
        put("date", "Date", "दिनांक");
        put("guest", "Guest", "अतिथि");
        put("phone", "Phone", "फ़ोन");
        put("address", "Address", "पता");
        put("idProof", "ID", "पहचान");
        put("stay", "Stay", "ठहराव");
        put("room", "Room", "कमरा");
        put("arrival", "Arrival", "आगमन");
        put("departure", "Departure", "प्रस्थान");
        put("guests", "Guests", "अतिथि संख्या");
        put("description", "Description", "विवरण");
        put("qty", "Qty", "मात्रा");
        put("rate", "Rate", "दर");
        put("amount", "Amount", "राशि");
        put("taxable", "Taxable", "कर योग्य");
        put("cgst", "CGST", "सीजीएसटी");
        put("sgst", "SGST", "एसजीएसटी");
        put("igst", "IGST", "आईजीएसटी");
        put("billTo", "Bill to", "बिल प्राप्तकर्ता");
        put("buyerGstin", "Buyer GSTIN", "क्रेता जीएसटीआईएन");
        put("total", "Total", "कुल");
        put("paid", "Paid", "भुगतान");
        put("deposit", "Deposit held", "जमा राशि");
        put("balance", "Balance", "शेष");
        put("payments", "Payments", "भुगतान विवरण");
        put("mode", "Mode", "माध्यम");
        put("reference", "Reference", "संदर्भ");
        put("gstin", "GSTIN", "जीएसटीआईएन");
        put("hsn", "HSN", "एचएसएन");
        put("scanToPay", "Scan to pay", "भुगतान हेतु स्कैन करें");
        put("noGoodsOrServices", "No goods or services were provided against this donation.",
                "इस दान के बदले कोई वस्तु या सेवा प्रदान नहीं की गई है।");
        put("reg80g", "80G Registration", "80जी पंजीकरण");
        put("against", "Against invoice", "बीजक के विरुद्ध");
        put("reason", "Reason", "कारण");
        put("provisionalNote", "Provisional receipt. A tax invoice will follow at checkout.",
                "अस्थायी रसीद। प्रस्थान के समय कर बीजक जारी किया जाएगा।");
        put("policeRegister", "Guest Register", "अतिथि रजिस्टर");
        put("serial", "S.No.", "क्र.सं.");
        put("nationality", "Nationality", "राष्ट्रीयता");
        put("adults", "Adults", "वयस्क");
        put("children", "Children", "बच्चे");
        put("members", "Members", "सदस्य");
        put("purpose", "Purpose", "उद्देश्य");
        put("period", "Period", "अवधि");
    }

    private static void put(String key, String en, String hi) { LABELS.put(key, new String[]{en, hi}); }

    /** Both languages, e.g. "Total / कुल", with the guest's language first. */
    public static String bilingual(String key, String guestLanguage) {
        String[] v = LABELS.get(key);
        if (v == null) return key;
        return "hi".equals(guestLanguage) ? v[1] + " / " + v[0] : v[0] + " / " + v[1];
    }

    public static Map<String, String> all(String guestLanguage) {
        Map<String, String> out = new LinkedHashMap<>();
        LABELS.forEach((k, v) -> out.put(k, bilingual(k, guestLanguage)));
        return out;
    }
}
