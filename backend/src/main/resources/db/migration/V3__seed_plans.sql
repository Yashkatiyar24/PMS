-- Plan limits are rows, not code (PRD section 10).
INSERT INTO plans (code, name, max_rooms, monthly_paise, annual_paise, included_messages) VALUES
  ('basic',    'Basic',    20,     49900,  500000, 300),
  ('standard', 'Standard', 60,     99900, 1000000, 300),
  ('large',    'Large',    100000, 149900, 1500000, 300)
ON CONFLICT (code) DO NOTHING;
