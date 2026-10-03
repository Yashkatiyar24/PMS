-- Floor names, and the few per-room details the rooms screen asks for.
--
-- Floors are a label and an order, nothing more. A room already carries its floor as a number, and every
-- availability, booking and housekeeping query reads it from there; putting a floor_id on rooms would drag a
-- join through all of that to hold a word like "Ground". So this table is additive: a floor with no row here
-- is still a floor, shown by its number, and deleting a row renames a floor rather than deleting rooms.
CREATE TABLE floors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ON DELETE CASCADE, unlike rooms: a floor holds no history, nothing references it, and a label cannot
  -- mean anything once its property is gone. Rooms keep their plain key because a stay, a folio and a
  -- receipt all point at them.
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  number      integer NOT NULL,                  -- matches rooms.floor
  name        text NOT NULL DEFAULT '',          -- '' shows as "Floor <number>" in the app's own language
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, number)
);
CREATE INDEX floors_property_idx ON floors(property_id, sort_order, number);

ALTER TABLE floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE floors FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant ON floors USING (property_id = current_property_id()) WITH CHECK (property_id = current_property_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON floors TO pms_app, pms_admin;

-- Existing properties keep every room they have; this only gives their floors a row to be named through.
INSERT INTO floors (property_id, number, sort_order)
SELECT DISTINCT property_id, floor, floor FROM rooms;

-- What the rooms screen asks about a single room and the room type cannot answer: a name ("Corner suite"),
-- the bed in it, and a note. Rate, occupancy and amenities stay on room_types, which is what the charge
-- engine and the online rate card read — a room is priced by changing its type.
ALTER TABLE rooms
  ADD COLUMN name        text NOT NULL DEFAULT '',
  ADD COLUMN bed_type    text NOT NULL DEFAULT '',
  ADD COLUMN description text NOT NULL DEFAULT '';
