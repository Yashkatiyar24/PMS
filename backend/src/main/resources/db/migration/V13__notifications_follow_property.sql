-- The notification feed is transient: it goes with its property rather than holding the property row in place.
ALTER TABLE notifications DROP CONSTRAINT notifications_property_id_fkey,
  ADD CONSTRAINT notifications_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE notification_reads DROP CONSTRAINT notification_reads_property_id_fkey,
  ADD CONSTRAINT notification_reads_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
