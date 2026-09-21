-- A password someone else chose (an invite, a reset by the owner or by the platform) opens exactly one door:
-- the screen to replace it. Set wherever a password is issued; cleared when the person sets their own.
ALTER TABLE users ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
