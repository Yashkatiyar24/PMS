package in.pms.integrations.storage;

import in.pms.common.NotFoundException;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.time.Instant;

/** Files on local disk. Fine for one server and for development; swap to S3 by configuration. */
public class LocalStorageProvider implements StorageProvider {
    private final Path root;
    private final String appUrl;
    private final SignedUrlSigner signer;

    public LocalStorageProvider(String dir, String appUrl, SignedUrlSigner signer) {
        this.root = Path.of(dir).toAbsolutePath().normalize();
        this.appUrl = appUrl;
        this.signer = signer;
        try { Files.createDirectories(root); } catch (IOException e) { throw new IllegalStateException("Cannot create storage dir " + root, e); }
    }

    private Path resolve(String key) {
        Path p = root.resolve(key).normalize();
        if (!p.startsWith(root)) throw new IllegalArgumentException("Bad storage key");
        return p;
    }

    @Override public void put(String key, InputStream data, long length, String contentType) {
        try {
            Path p = resolve(key);
            Files.createDirectories(p.getParent());
            Files.copy(data, p, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) { throw new IllegalStateException("Cannot write " + key, e); }
    }

    @Override public String signedGetUrl(String key, Duration ttl) {
        long exp = Instant.now().plus(ttl).getEpochSecond();
        return appUrl + "/api/files/" + key + "?exp=" + exp + "&sig=" + signer.sign(key, exp);
    }

    @Override public InputStream get(String key) {
        try { return Files.newInputStream(resolve(key)); } catch (IOException e) { throw new NotFoundException("File"); }
    }

    @Override public void delete(String key) {
        try { Files.deleteIfExists(resolve(key)); } catch (IOException e) { throw new IllegalStateException("Cannot delete " + key, e); }
    }

    @Override public boolean exists(String key) { return Files.exists(resolve(key)); }
}
