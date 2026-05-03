-- =========================================================================
-- kitchen_send_batches: realtime publication so KDS picks up new send
-- batches via postgres_changes instead of lazy-fetching after each ticket
-- INSERT.
--
-- Bug: when cashier appends items via append_order_items, the RPC inserts
-- a new kitchen_send_batches row plus the corresponding kds_tickets. The
-- KDS realtime hook (use-kds-realtime.ts) subscribes to kds_tickets only,
-- so the new ticket arrives before the batch metadata. The batch lookup
-- function fetchKitchenBatchInfo runs lazily, but until it resolves, the
-- card renders the fallback `kitchenTicketNumber = #orderId` — chef sees
-- the wrong sequence number and may bump a misaligned ticket.
--
-- Fix: add kitchen_send_batches to supabase_realtime + REPLICA IDENTITY
-- FULL. The KDS hook can now react to INSERT events and update its
-- in-memory batchInfoMap before the matching ticket triggers a render.
--
-- Pairs with regression rule REALTIME-PUB-NEEDS-REPLICA-IDENTITY-FULL.
-- Both ALTER TABLE and the publication-add are idempotent — safe to
-- re-run.
-- =========================================================================

ALTER TABLE public.kitchen_send_batches REPLICA IDENTITY FULL;

DO $pub$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'kitchen_send_batches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.kitchen_send_batches;
  END IF;
END
$pub$;
