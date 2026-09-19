-- Rooms: the housekeeping cycle, buildings, amenities, who is cleaning what, and a hole in double-booking closed.

-- Housekeeping moves a room dirty -> cleaning -> clean -> inspected. "Available", "reserved" and "occupied" are
-- never stored: they follow from the bookings, so they cannot disagree with them.
-- 'blocked' is out of order (off sale until someone unblocks it); 'maintenance' is off sale while a repair is open.
ALTER TYPE room_status ADD VALUE IF NOT EXISTS 'cleaning';
ALTER TYPE room_status ADD VALUE IF NOT EXISTS 'inspected';
ALTER TYPE room_status ADD VALUE IF NOT EXISTS 'maintenance';

ALTER TABLE rooms
  ADD COLUMN building       text NOT NULL DEFAULT '',          -- '' when the property is one building
  ADD COLUMN housekeeper_id uuid REFERENCES users(id),         -- who is cleaning it now
  ADD COLUMN hk_priority    text NOT NULL DEFAULT 'normal',
  ADD COLUMN hk_note        text NOT NULL DEFAULT '',
  ADD CONSTRAINT rooms_hk_priority CHECK (hk_priority IN ('low', 'normal', 'high'));

ALTER TABLE room_types ADD COLUMN amenities text[] NOT NULL DEFAULT '{}';

-- The exclusion constraint compares COALESCE(bed_id, room_id), so it cannot see that a whole dormitory
-- room (bed_id null) and one of its beds are the same place. With dorm_whole_room_allowed on, both could be
-- sold for the same night. This trigger closes that, and makes two more promises in the database rather than
-- in the application: a unit's room belongs to the unit's property, and its bed belongs to its room.
--
-- It locks the dormitory's room row first, so two desks selling the whole room and one bed at the same moment
-- are serialised: the second one sees the first one's row and is refused. Ordinary rooms take no lock; the
-- exclusion constraint already covers them.
CREATE FUNCTION booking_units_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  room_property uuid;
  dorm boolean;
BEGIN
  IF NEW.cancelled_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT r.property_id, t.is_dormitory INTO room_property, dorm
    FROM rooms r JOIN room_types t ON t.id = r.room_type_id WHERE r.id = NEW.room_id;
  IF room_property IS NULL OR room_property <> NEW.property_id THEN
    RAISE EXCEPTION 'booking_units_room: room % is not part of this property', NEW.room_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.bed_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM beds WHERE id = NEW.bed_id AND room_id = NEW.room_id) THEN
    RAISE EXCEPTION 'booking_units_room: bed % is not in room %', NEW.bed_id, NEW.room_id USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF dorm THEN
    PERFORM 1 FROM rooms WHERE id = NEW.room_id FOR UPDATE;
    IF EXISTS (
      SELECT 1 FROM booking_units bu
       WHERE bu.room_id = NEW.room_id AND bu.id <> NEW.id AND bu.cancelled_at IS NULL
         AND (bu.bed_id IS NULL) <> (NEW.bed_id IS NULL)          -- whole room against a bed, either way round
         AND tstzrange(bu.arrive_at, bu.depart_at, '[)') && tstzrange(NEW.arrive_at, NEW.depart_at, '[)')) THEN
      RAISE EXCEPTION 'conflicting key value violates exclusion constraint "booking_units_no_overlap"' USING ERRCODE = 'exclusion_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER booking_units_guard
  BEFORE INSERT OR UPDATE OF room_id, bed_id, arrive_at, depart_at, cancelled_at ON booking_units
  FOR EACH ROW EXECUTE FUNCTION booking_units_guard();
