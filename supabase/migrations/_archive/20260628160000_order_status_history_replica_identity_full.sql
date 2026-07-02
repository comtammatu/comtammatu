-- order_status_history is in the supabase_realtime publication but kept the
-- default REPLICA IDENTITY (primary key only), so realtime UPDATE/DELETE
-- payloads dropped the changed columns. Set FULL to match its published peers
-- (orders, kds_tickets, kitchen_send_batches). Additive; no data change.
ALTER TABLE public.order_status_history REPLICA IDENTITY FULL;
