package in.pms.integrations.push;

import java.util.Map;

/** Push notifications to staff devices (approval requests, sync conflicts, daily report ready). */
public interface PushProvider {
    /** @return true if the token is still valid; false means the caller should delete it. */
    boolean send(String deviceToken, String title, String body, Map<String, String> data);
}
