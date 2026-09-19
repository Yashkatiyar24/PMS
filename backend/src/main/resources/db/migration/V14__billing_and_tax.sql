-- Billing: what a charge is for, money taken online, and IGST.

-- Money received through the payment gateway. The desk never picks it; the gateway's verified payment records it.
ALTER TYPE payment_mode ADD VALUE IF NOT EXISTS 'online';

-- What a charge is for (room, food, laundry, transport, ...), so a report can say where the money came from.
-- IGST sits next to CGST and SGST: a line carries either the pair or IGST, never both.
ALTER TABLE folio_lines
  ADD COLUMN category   text,
  ADD COLUMN igst_paise bigint NOT NULL DEFAULT 0;
UPDATE folio_lines SET category = 'room' WHERE kind IN ('room_charge', 'day_use');
