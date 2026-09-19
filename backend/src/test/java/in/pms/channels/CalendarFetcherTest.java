package in.pms.channels;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetAddress;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** A pasted calendar address must never let the server call into its own network. */
class CalendarFetcherTest {

    @Test
    void refusesAddressesInsideTheNetwork() throws Exception {
        for (String ip : new String[]{"127.0.0.1", "10.1.2.3", "172.16.5.4", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1"})
            assertThat(CalendarFetcher.isPublic(InetAddress.getByName(ip))).as(ip).isFalse();
        for (String ip : new String[]{"8.8.8.8", "151.101.1.1", "2606:4700::1111"})
            assertThat(CalendarFetcher.isPublic(InetAddress.getByName(ip))).as(ip).isTrue();
    }

    @Test
    void takesOnlyHttpsToAPublicHost() {
        assertThatThrownBy(() -> CalendarFetcher.check("http://calendar.example.com/a.ics")).isInstanceOf(IOException.class).hasMessageContaining("https");
        assertThatThrownBy(() -> CalendarFetcher.check("file:///etc/passwd")).isInstanceOf(IOException.class);
        assertThatThrownBy(() -> CalendarFetcher.check("https://127.0.0.1/a.ics")).isInstanceOf(IOException.class).hasMessageContaining("public");
        assertThatThrownBy(() -> CalendarFetcher.check("https://10.0.0.8:8443/a.ics")).isInstanceOf(IOException.class).hasMessageContaining("public");
        assertThatThrownBy(() -> CalendarFetcher.check("not a url")).isInstanceOf(IOException.class);
    }

    @Test
    void slugsAreReadableAndUnguessableEnough() {
        assertThat(ChannelService.slug("Shri Ram Dharamshala")).matches("shri-ram-dharamshala-[a-z2-9]{4}");
        assertThat(ChannelService.slug("श्री राम धर्मशाला")).matches("stay-[a-z2-9]{4}");
    }
}
