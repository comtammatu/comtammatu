BEGIN;

-- Realtime apply_rls (WAL walk + per-subscriber RLS) is the dominant DB cost.
-- Two published tables add WAL fan-out for no consumer benefit:
--   printer_agents: heartbeat UPSERT every 30s/agent (tens of thousands of
--     UPDATEs on ~2 rows). Its only realtime consumer (PrinterStatusBadge)
--     already polls every 30s + refetches on visibility/reconnect, so push
--     gives no freshness over the poll. The heartbeat cadence is itself 30s.
--   kitchen_send_batches: no realtime subscriber exists anywhere in the app.
-- Remove both from the publication. Guarded so the migration is re-runnable
-- (ALTER PUBLICATION ... DROP TABLE errors when the table is not a member).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'printer_agents'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.printer_agents;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'kitchen_send_batches'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.kitchen_send_batches;
  END IF;
END $$;

DO $$
DECLARE
  v_remaining int;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename IN ('printer_agents', 'kitchen_send_batches');

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'realtime unpublish incomplete: % table(s) still published', v_remaining;
  END IF;
END $$;

COMMIT;
