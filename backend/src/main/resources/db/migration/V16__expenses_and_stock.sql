-- What the property spends, and what it keeps on the shelf.

-- An expense is money out: electricity, salaries, a plumber. It is never deleted, only voided with a reason,
-- so the month's figures cannot quietly change after the accountant has seen them.
CREATE TABLE expenses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid NOT NULL REFERENCES properties(id),
  spent_on     date NOT NULL,
  category     text NOT NULL,
  amount_paise bigint NOT NULL,
  vendor       text NOT NULL DEFAULT '',
  payment_mode text NOT NULL DEFAULT 'cash',
  description  text NOT NULL DEFAULT '',
  receipt_key  text,                                   -- the bill's photo or PDF, in object storage
  voided_at    timestamptz,
  void_reason  text,
  created_by   uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expenses_category CHECK (category IN ('utilities', 'maintenance', 'salaries', 'cleaning', 'supplies', 'food', 'marketing', 'other')),
  CONSTRAINT expenses_mode CHECK (payment_mode IN ('cash', 'upi', 'card', 'bank', 'cheque')),
  CONSTRAINT expenses_positive CHECK (amount_paise > 0)
);
CREATE INDEX expenses_spent_idx ON expenses(property_id, spent_on);

-- Stock is never a number someone types over: it is the sum of every movement in and out, so it can be
-- traced back and closing stock for any day can be worked out. Linen sent to the laundry leaves the shelf
-- and comes back; what is at the laundry right now is the difference.
CREATE TABLE inventory_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         uuid NOT NULL REFERENCES properties(id),
  name                text NOT NULL,
  category            text NOT NULL,
  unit                text NOT NULL DEFAULT 'pcs',
  low_stock_threshold numeric(12,2) NOT NULL DEFAULT 0,
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_items_category CHECK (category IN ('cleaning', 'linen', 'toiletries', 'food', 'maintenance', 'stationery'))
);
CREATE UNIQUE INDEX inventory_items_name_uq ON inventory_items(property_id, lower(name));

CREATE TABLE inventory_movements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid NOT NULL REFERENCES properties(id),
  item_id         uuid NOT NULL REFERENCES inventory_items(id),
  kind            text NOT NULL,
  qty_change      numeric(12,2) NOT NULL,              -- signed: + into the store, - out of it
  unit_cost_paise bigint,                              -- what a purchase cost per unit
  room_id         uuid REFERENCES rooms(id),           -- where it was used, when that matters
  note            text NOT NULL DEFAULT '',
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_movements_kind CHECK (kind IN ('opening', 'purchase', 'consumption', 'adjustment', 'to_laundry', 'from_laundry')),
  CONSTRAINT inventory_movements_nonzero CHECK (qty_change <> 0)
);
CREATE INDEX inventory_movements_item_idx ON inventory_movements(item_id, created_at);
CREATE INDEX inventory_movements_property_idx ON inventory_movements(property_id, created_at);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON expenses USING (property_id = current_property_id()) WITH CHECK (property_id = current_property_id());
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON inventory_items USING (property_id = current_property_id()) WITH CHECK (property_id = current_property_id());
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON inventory_movements USING (property_id = current_property_id()) WITH CHECK (property_id = current_property_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON expenses, inventory_items, inventory_movements TO pms_app, pms_admin;
-- Movements are history: they are corrected with an adjustment, never edited or removed.
REVOKE UPDATE, DELETE ON inventory_movements FROM pms_app;
