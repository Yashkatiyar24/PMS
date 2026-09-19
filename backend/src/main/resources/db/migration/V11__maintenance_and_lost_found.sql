-- Repairs, and things guests leave behind.

-- A repair ticket moves open -> assigned -> in_progress -> resolved -> closed. When it takes its room off sale,
-- the room is 'maintenance' until the last such ticket is resolved, and then comes back dirty for housekeeping.
CREATE TABLE maintenance_tickets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         uuid NOT NULL REFERENCES properties(id),
  room_id             uuid REFERENCES rooms(id),              -- null for the building itself: a lift, the pump
  issue               text NOT NULL,
  description         text NOT NULL DEFAULT '',
  priority            text NOT NULL DEFAULT 'normal',
  status              text NOT NULL DEFAULT 'open',
  assigned_to         uuid REFERENCES users(id),
  resolution          text,
  takes_room_off_sale boolean NOT NULL DEFAULT false,
  reported_by         uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  resolved_at         timestamptz,
  CONSTRAINT maintenance_priority CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  CONSTRAINT maintenance_status CHECK (status IN ('open', 'assigned', 'in_progress', 'resolved', 'closed'))
);
CREATE INDEX maintenance_tickets_status_idx ON maintenance_tickets(property_id, status, created_at DESC);
CREATE INDEX maintenance_tickets_room_idx ON maintenance_tickets(room_id) WHERE room_id IS NOT NULL;

CREATE TABLE lost_found_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id),
  room_id     uuid REFERENCES rooms(id),
  description text NOT NULL,
  found_at    timestamptz NOT NULL DEFAULT now(),
  found_by    uuid REFERENCES users(id),
  status      text NOT NULL DEFAULT 'held',
  returned_to text,
  notes       text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lost_found_status CHECK (status IN ('held', 'returned', 'disposed'))
);
CREATE INDEX lost_found_items_idx ON lost_found_items(property_id, status, found_at DESC);

ALTER TABLE maintenance_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON maintenance_tickets USING (property_id = current_property_id()) WITH CHECK (property_id = current_property_id());
ALTER TABLE lost_found_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON lost_found_items USING (property_id = current_property_id()) WITH CHECK (property_id = current_property_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance_tickets, lost_found_items TO pms_app, pms_admin;
