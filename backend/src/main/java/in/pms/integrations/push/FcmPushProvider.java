package in.pms.integrations.push;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.*;

import java.io.ByteArrayInputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/** Firebase Cloud Messaging via the Admin SDK. Credentials: service-account JSON inline or {@code file:/path}. */
public class FcmPushProvider implements PushProvider {
    private final FirebaseMessaging messaging;

    public FcmPushProvider(String credentialsJson) {
        try (InputStream in = credentialsJson.startsWith("file:")
                ? new FileInputStream(credentialsJson.substring(5))
                : new ByteArrayInputStream(credentialsJson.getBytes(StandardCharsets.UTF_8))) {
            var options = FirebaseOptions.builder().setCredentials(GoogleCredentials.fromStream(in)).build();
            var app = FirebaseApp.getApps().isEmpty() ? FirebaseApp.initializeApp(options) : FirebaseApp.getInstance();
            this.messaging = FirebaseMessaging.getInstance(app);
        } catch (IOException e) { throw new IllegalStateException("Cannot load FCM credentials", e); }
    }

    @Override public boolean send(String deviceToken, String title, String body, Map<String, String> data) {
        var msg = Message.builder().setToken(deviceToken)
                .setNotification(Notification.builder().setTitle(title).setBody(body).build())
                .putAllData(data == null ? Map.of() : data).build();
        try { messaging.send(msg); return true; }
        catch (FirebaseMessagingException e) {
            var code = e.getMessagingErrorCode();
            if (code == MessagingErrorCode.UNREGISTERED || code == MessagingErrorCode.INVALID_ARGUMENT) return false;
            throw new IllegalStateException("FCM send failed: " + code, e);
        }
    }
}
