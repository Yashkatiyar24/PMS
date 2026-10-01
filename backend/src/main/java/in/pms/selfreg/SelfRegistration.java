package in.pms.selfreg;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * What the desk sees about a self-registration link it created. Never carries the token itself.
 *
 * <p>{@code draft} is the live copy of the register's questions, shared with the guest's phone and written
 * from either side field by field; {@code version} is what each side polls with so it can tell a real change
 * from its own echo, and {@code status} is what the desk's status line shows while the guest works.
 */
public record SelfRegistration(UUID id, String state, String status, int version,
                               Map<String, Object> draft, Map<String, Object> ocr,
                               OffsetDateTime expiresAt, OffsetDateTime submittedAt,
                               Submission submitted, boolean hasIdPhoto) {

    /**
     * Exactly what the guest typed, kept apart from the guest record until the desk applies it.
     *
     * <p>Nothing here has touched {@code guests} yet. That separation is the whole security model: someone
     * who somehow reached the form can fill this in with nonsense, and the worst they achieve is a row the
     * desk looks at and discards.
     */
    public record Submission(String name, String phone, String city, String address, String nationality,
                             String idType, String idLast4, String passportNo, int adults, int children,
                             String purpose, List<Member> members, boolean consent, boolean whatsappOptIn) {
        public record Member(String name, boolean adult) {}
    }
}
