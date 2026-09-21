-- What the platform team knows about a property that the property does not need to see: who was called about
-- billing, what the owner asked for, why a module was switched on. Free text, read and written only through
-- the platform's own screens.
ALTER TABLE properties ADD COLUMN platform_notes text;
