-- The rest of a guest's record: how to reach them, where they are from, and their photograph.
ALTER TABLE guests
  ADD COLUMN email     text,
  ADD COLUMN state     text NOT NULL DEFAULT '',
  ADD COLUMN country   text NOT NULL DEFAULT '',        -- where they live; nationality stays the passport's country
  ADD COLUMN photo_key text;                            -- object storage, served only through short-lived signed links
CREATE INDEX guests_name_idx ON guests(property_id, lower(name) text_pattern_ops);
