package in.pms.channels;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * Downloads an OTA's calendar from the address the owner pasted.
 *
 * <p>That address is typed by a user, so the server must not become a way to reach inside its own network:
 * only https, only to addresses on the public internet, checked again on every redirect, with a timeout and a
 * size cap.
 */
@Component
public class CalendarFetcher {
    static final int MAX_BYTES = 2 * 1024 * 1024;
    private static final int MAX_REDIRECTS = 3;

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    public String fetch(String address) throws IOException, InterruptedException {
        URI uri = check(address);
        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            HttpRequest request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(20))
                    .header("User-Agent", "DharamshalaPMS-CalendarSync/1").GET().build();
            HttpResponse<InputStream> response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream body = response.body()) {
                int status = response.statusCode();
                if (status >= 300 && status < 400) {
                    String next = response.headers().firstValue("Location").orElseThrow(() -> new IOException("The calendar redirected without an address"));
                    uri = check(uri.resolve(next).toString());
                    continue;
                }
                if (status != 200) throw new IOException("The calendar address answered HTTP " + status);
                byte[] bytes = body.readNBytes(MAX_BYTES + 1);
                if (bytes.length > MAX_BYTES) throw new IOException("The calendar is larger than 2 MB");
                return new String(bytes, StandardCharsets.UTF_8);
            }
        }
        throw new IOException("The calendar address redirects too many times");
    }

    /**
     * An https address whose host resolves only to public addresses.
     *
     * <p>ponytail: the host is resolved here and again by the HTTP client, so a DNS answer that changes in
     * between (rebinding) is not caught; pin the resolved address in the request if calendars ever come from
     * less trusted sources than the owner's own OTA account.
     */
    static URI check(String address) throws IOException {
        URI uri;
        try { uri = new URI(address == null ? "" : address.trim()); }
        catch (URISyntaxException e) { throw new IOException("That is not a web address"); }
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) throw new IOException("A calendar address must start with https://");
        for (InetAddress a : InetAddress.getAllByName(uri.getHost()))
            if (!isPublic(a)) throw new IOException("That address is not on the public internet");
        return uri;
    }

    static boolean isPublic(InetAddress a) {
        if (a.isAnyLocalAddress() || a.isLoopbackAddress() || a.isLinkLocalAddress() || a.isSiteLocalAddress() || a.isMulticastAddress()) return false;
        byte[] b = a.getAddress();
        if (b.length == 4) {
            int first = b[0] & 0xff, second = b[1] & 0xff;
            if (first == 0 || first >= 224) return false;                            // "this network", multicast and reserved
            if (first == 100 && second >= 64 && second <= 127) return false;          // carrier-grade NAT
            if (first == 198 && (second == 18 || second == 19)) return false;         // benchmarking
        } else if ((b[0] & 0xfe) == 0xfc) {
            return false;                                                             // IPv6 unique local, fc00::/7
        }
        return true;
    }
}
