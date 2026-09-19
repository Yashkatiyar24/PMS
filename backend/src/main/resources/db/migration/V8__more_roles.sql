-- More roles than owner / manager / staff (the old three keep exactly the access they had).
-- What each role may do is code, not data: see in.pms.auth.Permissions.
--   admin        : runs a property like a manager, and may also manage its staff
--   receptionist : the front desk; the same as staff
--   housekeeping : room status, lost and found, linen and supplies
--   accountant   : revenue, invoices, refunds, expenses
--   maintenance  : repair tickets
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'receptionist';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'housekeeping';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'accountant';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'maintenance';
