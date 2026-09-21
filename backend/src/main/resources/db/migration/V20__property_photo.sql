-- A photograph of the property: shown to guests on its booking page and to the platform's back office.
-- The image itself lives in object storage under the property's own prefix; only its key is kept here.
ALTER TABLE properties ADD COLUMN photo_key text;
