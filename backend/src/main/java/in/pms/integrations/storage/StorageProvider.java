package in.pms.integrations.storage;

import java.io.InputStream;
import java.time.Duration;

/**
 * Blob storage for ID photos, receipt PDFs and backups. Keys are paths like {@code <property>/id-photos/<uuid>.jpg}.
 * Implementations: {@link LocalStorageProvider} (disk, dev) and {@link S3StorageProvider} (S3, Cloudflare R2, MinIO).
 */
public interface StorageProvider {
    void put(String key, InputStream data, long length, String contentType);
    /** A URL a browser can GET for a short time. Local storage returns an API URL; S3 returns a presigned URL. */
    String signedGetUrl(String key, Duration ttl);
    InputStream get(String key);
    void delete(String key);
    boolean exists(String key);
}
