-- Selling rooms online: the property's own booking page, and calendar sync with the OTAs (iCal).
--
-- iCal is the connection every OTA offers without a partner contract. It carries dates only: no guest, no
-- price. So an OTA stay arrives here as a reservation for "<OTA> guest" at rate 0, and the desk fills in the
-- rest on arrival. Live two-way rate and availability sync needs certified-partner access per OTA and is a
-- later phase.

ALTER TYPE booking_source ADD VALUE IF NOT EXISTS 'direct';   -- the property's own booking page
ALTER TYPE booking_source ADD VALUE IF NOT EXISTS 'ota';      -- imported from an OTA calendar

-- The public name in the booking page's address, e.g. /book/shri-ram-dharamshala-k3f9. Set when the owner
-- first asks for the page; a random tail keeps two properties with the same name apart.
ALTER TABLE properties ADD COLUMN booking_slug text UNIQUE;

-- One row per room and OTA: our calendar out to the OTA, and the OTA's calendar in.
--
-- The export token is stored as-is, unlike login and self-registration tokens: the owner must be able to
-- copy the address again whenever an OTA asks for it, and what it exposes is only which dates one room is
-- busy, never a name or an amount. It can be rotated.
CREATE TABLE channel_links (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id    uuid NOT NULL REFERENCES properties(id),
  room_id        uuid NOT NULL REFERENCES rooms(id),
  channel        text NOT NULL,
  export_token   text NOT NULL UNIQUE,
  import_url     text,
  last_synced_at timestamptz,
  last_error     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channel_links_channel CHECK (channel IN ('airbnb', 'booking_com', 'makemytrip', 'agoda', 'expedia', 'other')),
  UNIQUE (room_id, channel)
);

-- Every stay seen on an OTA calendar, keyed by the event's UID so a re-sync updates instead of duplicating.
-- booking_id is null when the stay could not be placed because the room is already taken here: that is a
-- double booking, and `conflict` says so until someone resolves it.
CREATE TABLE channel_stays (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid NOT NULL REFERENCES properties(id),
  link_id      uuid NOT NULL REFERENCES channel_links(id) ON DELETE CASCADE,
  external_uid text NOT NULL,
  booking_id   uuid REFERENCES bookings(id),
  arrive_on    date NOT NULL,
  depart_on    date NOT NULL,
  summary      text NOT NULL DEFAULT '',
  conflict     text,
  seen_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (link_id, external_uid)
);
CREATE INDEX channel_stays_conflict_idx ON channel_stays(property_id) WHERE conflict IS NOT NULL;

ALTER TABLE channel_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON channel_links USING (property_id = current_property_id()) WITH CHECK (property_id = current_property_id());
ALTER TABLE channel_stays ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON channel_stays USING (property_id = current_property_id()) WITH CHECK (property_id = current_property_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON channel_links, channel_stays TO pms_app, pms_admin;
