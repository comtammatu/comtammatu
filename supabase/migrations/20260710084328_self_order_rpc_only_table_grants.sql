-- Self-order mutations are mediated by audited RPCs. Keep authenticated SELECT
-- access for staff reconciliation, but remove every direct DML path.
REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.self_order_sessions,
  public.self_order_batches,
  public.self_order_payment_requests
FROM PUBLIC, anon, authenticated;
