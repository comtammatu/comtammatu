-- Rollback of 20260428000000_pos_realtime_publication.sql
-- Removes orders + tables from supabase_realtime publication.
-- Idempotent: safe to run if tables were already dropped out-of-band.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'tables'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.tables;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.orders;
  END IF;
END $$;
