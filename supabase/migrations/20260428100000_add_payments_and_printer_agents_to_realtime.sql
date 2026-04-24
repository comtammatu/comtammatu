-- =========================================================================
-- Add `payments` + `printer_agents` to supabase_realtime publication.
--
-- Both tables have client-side subscribers that were silently broken:
--
-- - `apps/web/app/br/[branchId]/pos/_components/bill/bill-receipt-payment-status.tsx:34`
--   subscribes `payments:id={paymentId}` postgres_changes UPDATE to cross-
--   sync payment state across tablets. Without `payments` in the
--   publication, events never fire → cashier confirms on tablet A, tablet
--   B still shows "đang chờ khách xác nhận". Partial cause of the "bị
--   treo, không có nút xác thực" issue reported during pilot (the other
--   half was the qr_data guard, fixed separately in commit 11e4d19).
--
-- - `apps/web/app/br/[branchId]/pos/printer-status-badge.tsx:74`
--   subscribes `printer_agents:branch=...` for the "Agent online/offline"
--   badge. Without the table in the publication, the badge stays frozen
--   until the user manually reloads.
--
-- Silent failure mode: the subscribe() call itself succeeds (channel
-- status=SUBSCRIBED) even when the table isn't in the publication, so
-- there's no error to surface. The only symptom is that no events arrive
-- ever — exactly the kind of bug CLAUDE.md calls out ("RLS returns
-- {data: null, error: null} on blocked writes — no error thrown").
--
-- Migration is idempotent: wrapped in DO blocks that check
-- pg_publication_tables first, so re-running on a DB that already has
-- these tables is a no-op.
-- =========================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'printer_agents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.printer_agents;
  END IF;
END $$;
