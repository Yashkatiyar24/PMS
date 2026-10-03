-- The guest's own link to their own stay: what they booked, what it costs, what they have paid.
--
-- Deliberately not the self-registration link (guest_registrations). That one lives for minutes, is spent
-- once and exists to collect the register; this one lives through the stay and only ever shows. Keeping
-- them apart means a registration token can never be replayed to read a bill, nor the reverse.
--
-- The token itself is never stored, only its SHA-256, exactly as sessions and registration links do.
CREATE TABLE stay_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id),
  booking_id  uuid NOT NULL REFERENCES bookings(id),
  token_hash  text NOT NULL UNIQUE,
  opens       integer NOT NULL DEFAULT 0,   -- a brake on token guessing, and proof the guest opened it
  revoked_at  timestamptz,
  expires_at  timestamptz NOT NULL,
  created_by  uuid REFERENCES users(id),    -- null when the guest booked online and minted it themselves
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- One live link per booking is the normal case, so the desk resending finds the existing one.
CREATE INDEX stay_links_booking_idx ON stay_links(property_id, booking_id, created_at DESC);

ALTER TABLE stay_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE stay_links FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON stay_links USING (property_id = current_property_id()) WITH CHECK (property_id = current_property_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON stay_links TO pms_app, pms_admin;
