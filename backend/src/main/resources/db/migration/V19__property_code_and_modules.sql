-- One code per dharamshala. Its people sign in with the code, their mobile number and a password, so signing in
-- needs no SMS. The code names the place; it is not a secret, the password is.
ALTER TABLE properties ADD COLUMN code text;

-- Properties that exist already: the initials of the name and a running number, unique by construction.
UPDATE properties p SET code = x.code
FROM (SELECT id, coalesce(nullif(left(regexp_replace(initcap(name), '[^A-Z]', '', 'g'), 3), ''), 'DH')
                 || (1000 + row_number() OVER (ORDER BY created_at, id)) AS code
      FROM properties) x
WHERE x.id = p.id;

-- New properties: the initials and four random digits, e.g. "Shri Ram Dharamshala" -> SRD4821.
CREATE FUNCTION properties_code_default() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  prefix text := coalesce(nullif(left(regexp_replace(initcap(NEW.name), '[^A-Z]', '', 'g'), 3), ''), 'DH');
BEGIN
  IF NEW.code IS NULL THEN
    -- ponytail: 9,000 codes per prefix; when one fills up the unique index refuses the insert. Add a digit then.
    FOR attempt IN 1..100 LOOP
      NEW.code := prefix || (1000 + floor(random() * 9000)::int);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM properties WHERE code = NEW.code);
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER properties_code_default BEFORE INSERT ON properties
  FOR EACH ROW EXECUTE FUNCTION properties_code_default();

ALTER TABLE properties ALTER COLUMN code SET NOT NULL;
ALTER TABLE properties ADD CONSTRAINT properties_code_key UNIQUE (code);
ALTER TABLE properties ADD CONSTRAINT properties_code_format CHECK (code ~ '^[A-Z0-9]{4,12}$');

-- The optional parts of the product. A dharamshala onboarded from now on starts with the basics only (onboarding
-- sets this to empty) and the platform switches each part on; properties that exist already keep everything.
ALTER TABLE properties ADD COLUMN modules text[] NOT NULL
  DEFAULT '{restaurant,inventory,expenses,maintenance,lost_found,audit}';
ALTER TABLE properties ADD CONSTRAINT properties_modules_known
  CHECK (modules <@ '{restaurant,inventory,expenses,maintenance,lost_found,audit}'::text[]);
