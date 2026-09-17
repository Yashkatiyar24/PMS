package in.pms.integrations.pdf;

/** HTML to PDF for receipts, the police register and reports. */
public interface PdfRenderer {
    byte[] render(String html, String baseUrl);
}
