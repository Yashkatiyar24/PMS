package in.pms.integrations.pdf;

import com.openhtmltopdf.pdfboxout.PdfRendererBuilder;

import java.io.ByteArrayOutputStream;

/** In-process renderer (no Chromium). The HTML must be well-formed XHTML; templates are written that way. */
public class OpenHtmlPdfRenderer implements PdfRenderer {
    @Override public byte[] render(String html, String baseUrl) {
        try (var out = new ByteArrayOutputStream()) {
            new PdfRendererBuilder().useFastMode().withHtmlContent(html, baseUrl).toStream(out).run();
            return out.toByteArray();
        } catch (Exception e) { throw new IllegalStateException("PDF rendering failed", e); }
    }
}
