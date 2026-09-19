-- What the staff should know about, as it happens: a new booking, a payment, a room ready, a repair needed.
-- Each row is shown in the app to the members whose role holds `permission` (everyone when null), and is also
-- pushed to their devices through the outbox. Guests are told separately, on WhatsApp, only with their opt-in.
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id),
  kind        text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  link        text,
  permission  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_recent_idx ON notifications(property_id, created_at DESC);

-- How far each person has read, per property: one row, not one per notification.
CREATE TABLE notification_reads (
  property_id uuid NOT NULL REFERENCES properties(id),
  user_id     uuid NOT NULL REFERENCES users(id),
  seen_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, user_id)
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON notifications USING (property_id = current_property_id()) WITH CHECK (property_id = current_property_id());
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON notification_reads USING (property_id = current_property_id()) WITH CHECK (property_id = current_property_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications, notification_reads TO pms_app, pms_admin;
