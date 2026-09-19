-- A small restaurant: a menu, orders, and two ways to settle one. Posted to a guest's room, the order becomes one
-- charge on their bill; paid at the counter, it becomes a payment of its own with a numbered bill.

CREATE TABLE menu_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id),
  name        text NOT NULL,
  category    text NOT NULL DEFAULT '',
  price_paise bigint NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menu_items_price CHECK (price_paise >= 0)
);
CREATE INDEX menu_items_property_idx ON menu_items(property_id, active, sort_order);

CREATE TABLE pos_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES properties(id),
  booking_id    uuid REFERENCES bookings(id),         -- the stay it is for, when a guest orders to the room
  table_label   text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'open',
  taxable_paise bigint NOT NULL DEFAULT 0,
  tax_rate_bp   integer NOT NULL DEFAULT 0,
  cgst_paise    bigint NOT NULL DEFAULT 0,
  sgst_paise    bigint NOT NULL DEFAULT 0,
  total_paise   bigint NOT NULL DEFAULT 0,
  bill_number   text,                                  -- gap-free per property and financial year, when paid at the counter
  folio_line_id uuid REFERENCES folio_lines(id) ON DELETE SET NULL,
  cancel_reason text,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  closed_at     timestamptz,
  CONSTRAINT pos_orders_status CHECK (status IN ('open', 'posted', 'paid', 'cancelled'))
);
CREATE INDEX pos_orders_property_idx ON pos_orders(property_id, status, created_at DESC);

CREATE TABLE pos_order_lines (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid NOT NULL REFERENCES properties(id),
  order_id     uuid NOT NULL REFERENCES pos_orders(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES menu_items(id),
  name         text NOT NULL,
  qty          integer NOT NULL,
  unit_paise   bigint NOT NULL,
  CONSTRAINT pos_order_lines_qty CHECK (qty > 0),
  CONSTRAINT pos_order_lines_price CHECK (unit_paise >= 0)
);
CREATE INDEX pos_order_lines_order_idx ON pos_order_lines(order_id);

-- A counter sale is paid without a stay, so a payment belongs to a folio or to an order. Keeping it in the one
-- payments table means the day's collections, cash in hand and the handover count it without being told.
ALTER TABLE payments ALTER COLUMN folio_id DROP NOT NULL;
ALTER TABLE payments ADD COLUMN pos_order_id uuid REFERENCES pos_orders(id);
ALTER TABLE payments ADD CONSTRAINT payments_belongs CHECK (folio_id IS NOT NULL OR pos_order_id IS NOT NULL);

-- Restaurant bills are numbered from their own gap-free counter.
ALTER TYPE receipt_kind ADD VALUE IF NOT EXISTS 'pos_bill';

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON menu_items USING (property_id = current_property_id()) WITH CHECK (property_id = current_property_id());
ALTER TABLE pos_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON pos_orders USING (property_id = current_property_id()) WITH CHECK (property_id = current_property_id());
ALTER TABLE pos_order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON pos_order_lines USING (property_id = current_property_id()) WITH CHECK (property_id = current_property_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON menu_items, pos_orders, pos_order_lines TO pms_app, pms_admin;
