package in.pms.integrations.pdf;

/** When PDF is disabled: receipts are still printable as HTML from the browser. */
public class NoopPdfRenderer implements PdfRenderer {
    @Override public byte[] render(String html, String baseUrl) { throw new UnsupportedOperationException("PDF rendering is disabled (pms.pdf.provider=none)"); }
}
