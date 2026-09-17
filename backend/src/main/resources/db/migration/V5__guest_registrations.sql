-- Guest self-registration: the desk shows a QR, the guest fills their own details on their own phone.
--
-- This is the only table in the system a stranger can reach, so the shape is deliberately defensive:
--   * only the SHA-256 of the link token is stored, so a database leak yields no usable links;
--   * every row expires, and state moves one way (open -> submitted -> applied), so a link works once;
--   * what the guest typed is kept verbatim in `submitted` and is NOT written to guests until the desk
--     applies it, so a stranger who guesses a token can never alter an existing guest record;
--   * property_id is on the row and RLS applies, so a token resolved on the admin role still cannot be
--     used to read or write another property's data.

CREATE TABLE guest_registrations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      uuid NOT NULL REFERENCES properties(id),
  booking_id       uuid REFERENCES bookings(id),      -- set when the link was made for an existing booking
  token_hash       text NOT NULL UNIQUE,              -- SHA-256 of the token; the token itself is never stored
  state            text NOT NULL DEFAULT 'open',      -- open | submitted | applied | revoked
  submitted        jsonb,                             -- exactly what the guest typed, before any desk edit
  submitted_at     timestamptz,
  id_photo_key     text,
  applied_guest_id uuid REFERENCES guests(id),
  applied_at       timestamptz,
  opens            integer NOT NULL DEFAULT 0,        -- form fetches; a brake on token guessing
  created_by       uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  CONSTRAINT guest_registrations_state CHECK (state IN ('open', 'submitted', 'applied', 'revoked'))
);
CREATE INDEX guest_registrations_property_idx ON guest_registrations(property_id, created_at DESC);
CREATE INDEX guest_registrations_booking_idx ON guest_registrations(booking_id) WHERE booking_id IS NOT NULL;

ALTER TABLE guest_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON guest_registrations
  USING (property_id = current_property_id())
  WITH CHECK (property_id = current_property_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON guest_registrations TO pms_app, pms_admin;
