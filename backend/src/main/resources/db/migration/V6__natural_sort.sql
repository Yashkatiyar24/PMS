-- Room numbers and bed labels sort the way a person counts: 99 before 100, D1-2 before D1-10.
-- Setting the collation on the columns makes every existing and future ORDER BY natural, so no query has
-- to remember. The ICU collation is deterministic, so equality and the unique constraints are unchanged.
CREATE COLLATION IF NOT EXISTS natural_sort (provider = icu, locale = 'und-u-kn');

ALTER TABLE rooms ALTER COLUMN number TYPE text COLLATE natural_sort;
ALTER TABLE beds ALTER COLUMN label TYPE text COLLATE natural_sort;
