package in.pms.files;

import in.pms.common.ForbiddenException;
import in.pms.integrations.storage.SignedUrlSigner;
import in.pms.integrations.storage.StorageProvider;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Serves files from local storage behind an HMAC-signed, expiring link. With S3 storage, links point at the
 * bucket directly and this endpoint is unused. No session is needed: the signature is the credential.
 */
@RestController
public class FilesController {
    private final StorageProvider storage;
    private final SignedUrlSigner signer;

    public FilesController(StorageProvider storage, SignedUrlSigner signer) { this.storage = storage; this.signer = signer; }

    @GetMapping("/api/files/**")
    public ResponseEntity<InputStreamResource> get(HttpServletRequest req, @RequestParam long exp, @RequestParam String sig) {
        String key = req.getRequestURI().substring("/api/files/".length());
        if (key.contains("..") || !signer.verify(key, exp, sig)) throw new ForbiddenException("Link expired or invalid");
        MediaType type = key.endsWith(".pdf") ? MediaType.APPLICATION_PDF : key.endsWith(".png") ? MediaType.IMAGE_PNG : key.endsWith(".webp") ? MediaType.parseMediaType("image/webp") : MediaType.IMAGE_JPEG;
        return ResponseEntity.ok().contentType(type).cacheControl(CacheControl.noStore()).body(new InputStreamResource(storage.get(key)));
    }
}
