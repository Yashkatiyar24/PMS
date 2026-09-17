package in.pms.integrations.sms;

/** Transactional SMS (login OTP). India requires DLT registration of the sender id and template. */
public interface SmsProvider {
    void sendOtp(String phone, String code);
}
