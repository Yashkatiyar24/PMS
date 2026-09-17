package in.pms.integrations.storage;

import in.pms.common.NotFoundException;
import in.pms.config.PmsProperties;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

import java.io.InputStream;
import java.net.URI;
import java.time.Duration;

/** Any S3-compatible store: AWS S3, Cloudflare R2, MinIO, Backblaze B2. Endpoint and path style come from config. */
public class S3StorageProvider implements StorageProvider {
    private final S3Client s3;
    private final S3Presigner presigner;
    private final String bucket;

    public S3StorageProvider(PmsProperties.S3 cfg) {
        var creds = StaticCredentialsProvider.create(AwsBasicCredentials.create(cfg.accessKey(), cfg.secretKey()));
        var region = Region.of(cfg.region() == null || cfg.region().isBlank() ? "auto" : cfg.region());
        var s3cfg = S3Configuration.builder().pathStyleAccessEnabled(cfg.pathStyle()).build();
        var b = S3Client.builder().credentialsProvider(creds).region(region).serviceConfiguration(s3cfg);
        var p = S3Presigner.builder().credentialsProvider(creds).region(region).serviceConfiguration(s3cfg);
        if (cfg.endpoint() != null && !cfg.endpoint().isBlank()) { b.endpointOverride(URI.create(cfg.endpoint())); p.endpointOverride(URI.create(cfg.endpoint())); }
        this.s3 = b.build();
        this.presigner = p.build();
        this.bucket = cfg.bucket();
    }

    @Override public void put(String key, InputStream data, long length, String contentType) {
        s3.putObject(PutObjectRequest.builder().bucket(bucket).key(key).contentType(contentType).build(), RequestBody.fromInputStream(data, length));
    }

    @Override public String signedGetUrl(String key, Duration ttl) {
        var req = GetObjectPresignRequest.builder().signatureDuration(ttl)
                .getObjectRequest(GetObjectRequest.builder().bucket(bucket).key(key).build()).build();
        return presigner.presignGetObject(req).url().toString();
    }

    @Override public InputStream get(String key) {
        try { return s3.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build()); }
        catch (NoSuchKeyException e) { throw new NotFoundException("File"); }
    }

    @Override public void delete(String key) { s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build()); }

    @Override public boolean exists(String key) {
        try { s3.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build()); return true; }
        catch (NoSuchKeyException e) { return false; }
    }
}
