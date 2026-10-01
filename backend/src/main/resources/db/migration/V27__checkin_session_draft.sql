-- The desk's check-in screen and the guest's phone become two views of one row.
--
-- Before this, a self-registration was a single all-or-nothing POST at the end: the desk saw nothing until
-- the guest pressed send, and a guest who reloaded their phone lost everything they had typed. The draft
-- below is the shared, canonical copy of the register's questions, written field by field from whichever
-- side is typing, so each side can show the other's work while it happens.
--
-- Shape notes:
--   * `draft` is merged with jsonb `||`, so a write touches only the fields it names. Two people typing in
--     different fields never overwrite each other, and no read-modify-write race exists to lose a keystroke.
--   * `draft_version` increments on every write. Each side polls with the version it last saw, so an
--     unchanged session costs one cheap comparison and a side never re-applies its own echo.
--   * `draft_source` says who wrote last (guest | owner | ocr), which is what the screens label and what the
--     audit log records.
--   * `ocr` holds what a document read *suggests*, with its confidence, kept apart from `draft` on purpose:
--     a suggestion is offered, never silently written over something a human typed.
--   * No full document number ever reaches either column; the same twelve-digit refusal that guards the
--     guest record guards every draft write.
ALTER TABLE guest_registrations
  ADD COLUMN draft            jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN draft_version    integer NOT NULL DEFAULT 0,
  ADD COLUMN draft_updated_at timestamptz,
  ADD COLUMN draft_source     text,                              -- guest | owner | ocr
  ADD COLUMN ocr              jsonb,                             -- {field: {value, confidence}, _doc: {...}}
  ADD COLUMN status           text    NOT NULL DEFAULT 'waiting', -- what the desk's status line shows
  ADD COLUMN guest_seen_at    timestamptz,                       -- the guest's phone last spoke to us
  ADD CONSTRAINT guest_registrations_status
      CHECK (status IN ('waiting', 'opened', 'filling', 'reading_id', 'submitted'));
