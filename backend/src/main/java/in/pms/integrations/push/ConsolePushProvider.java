package in.pms.integrations.push;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;

public class ConsolePushProvider implements PushProvider {
    private static final Logger log = LoggerFactory.getLogger(ConsolePushProvider.class);
    @Override public boolean send(String deviceToken, String title, String body, Map<String, String> data) {
        log.info("[console-push] token=...{} title={} body={} data={}", deviceToken.substring(Math.max(0, deviceToken.length() - 6)), title, body, data);
        return true;
    }
}
