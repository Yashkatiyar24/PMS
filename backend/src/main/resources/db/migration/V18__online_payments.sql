-- Payments taken through a gateway (Razorpay). One row per order we asked the gateway to collect; it moves
-- created -> paid | failed | expired, and a paid one points at the payment it produced on the folio.
CREATE TABLE payment_orders (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id        uuid NOT NULL REFERENCES properties(id),
  folio_id           uuid NOT NULL REFERENCES folios(id),
  booking_id         uuid NOT NULL REFERENCES bookings(id),
  gateway            text NOT NULL,
  gateway_order_id   text NOT NULL,
  amount_paise       bigint NOT NULL,
  status             text NOT NULL DEFAULT 'created',
  gateway_payment_id text,
  payment_id         uuid REFERENCES payments(id),
  failure_reason     text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_orders_status CHECK (status IN ('created', 'paid', 'failed', 'expired')),
  CONSTRAINT payment_orders_amount CHECK (amount_paise > 0),
  UNIQUE (gateway, gateway_order_id)
);
CREATE INDEX payment_orders_property_idx ON payment_orders(property_id, created_at DESC);
CREATE INDEX payment_orders_open_idx ON payment_orders(status, created_at) WHERE status = 'created';

-- A gateway payment is recorded once, however many times the browser, the webhook and reconciliation report it.
ALTER TABLE payments ADD COLUMN gateway_payment_id text;
CREATE UNIQUE INDEX payments_gateway_payment_uq ON payments(gateway_payment_id) WHERE gateway_payment_id IS NOT NULL AND NOT is_refund;
-- Which payment a refund gives money back from, so an online payment is never refunded twice over.
ALTER TABLE payments ADD COLUMN refund_of uuid REFERENCES payments(id);

ALTER TABLE payment_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON payment_orders USING (property_id = current_property_id()) WITH CHECK (property_id = current_property_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON payment_orders TO pms_app, pms_admin;
