package in.pms.guests;

import java.time.LocalDate;
import java.util.UUID;

public record Guest(UUID id, String name, String phone, String city, String address, String nationality, String idType, String idLast4,
                    boolean hasIdPhoto, String passportNo, String visaNo, LocalDate visaExpiry, String notes) {}
