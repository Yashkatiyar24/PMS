package in.pms.integrations.sms;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Development: prints the OTP to the log instead of sending. */
public class ConsoleSmsProvider implements SmsProvider {
    private static final Logger log = LoggerFactory.getLogger(ConsoleSmsProvider.class);
    @Override public void sendOtp(String phone, String code) { log.info("[console-sms] OTP for {}: {}", mask(phone), code); }
    static String mask(String phone) { return phone.length() > 4 ? "******" + phone.substring(phone.length() - 4) : phone; }
}
