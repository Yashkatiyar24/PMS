-- Reservations: a pending state, more sources, the details a reservation carries, and groups.

-- Pending: a booking that holds its rooms but is not confirmed yet (waiting for an online payment, or a
-- tentative hold the desk made). It releases its rooms at hold_until unless confirmed first.
ALTER TYPE booking_state ADD VALUE IF NOT EXISTS 'pending';

-- 'direct' used to mean the property's own booking page. That is the website; 'direct' now means a guest who
-- came to the property directly (a letter, an email, someone at the office) rather than through an agent.
-- Renaming keeps every existing row's meaning: the label moves, the stored value does not.
ALTER TYPE booking_source RENAME VALUE 'direct' TO 'website';
ALTER TYPE booking_source ADD VALUE IF NOT EXISTS 'direct';
ALTER TYPE booking_source ADD VALUE IF NOT EXISTS 'travel_agent';
ALTER TYPE booking_source ADD VALUE IF NOT EXISTS 'corporate';
ALTER TYPE booking_source ADD VALUE IF NOT EXISTS 'group';

ALTER TABLE bookings
  ADD COLUMN special_requests text NOT NULL DEFAULT '',
  ADD COLUMN group_name       text,          -- "Shri Ram Yatra Committee, Indore"
  ADD COLUMN organization     text,          -- the company, travel agent or trust behind the booking
  ADD COLUMN billing_gstin    text,          -- the company's GSTIN, printed on a B2B tax invoice
  ADD COLUMN hold_until       timestamptz;   -- a pending booking lets its rooms go after this
CREATE INDEX bookings_pending_idx ON bookings(property_id, hold_until) WHERE hold_until IS NOT NULL;

-- Which bed or room each member of a group sleeps in. Null while not yet allocated.
ALTER TABLE booking_members ADD COLUMN unit_id uuid REFERENCES booking_units(id);
