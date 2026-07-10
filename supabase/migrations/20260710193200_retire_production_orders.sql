-- Retire the production_orders / production_order_items entities.
-- PROD has 0 rows in either table; this drops the RPCs, the FK/column on
-- stock_movements that referenced production_orders, and the two tables
-- (CASCADE handles their own indexes, triggers, RLS policies, and grants).

BEGIN;

DROP FUNCTION IF EXISTS public.create_production_order(bigint, text, text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.confirm_production_order(bigint) CASCADE;
DROP FUNCTION IF EXISTS public.cancel_production_order(bigint) CASCADE;
DROP FUNCTION IF EXISTS public.ensure_production_order_central_kitchen() CASCADE;

ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_production_order_id_fkey;
ALTER TABLE public.stock_movements DROP COLUMN IF EXISTS production_order_id;

DROP TABLE IF EXISTS public.production_order_items CASCADE;
DROP TABLE IF EXISTS public.production_orders CASCADE;

-- Defensive: drop from the realtime publication if ever added (idempotent,
-- no-op when the table is not a publication member).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'production_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.production_orders;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'production_order_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.production_order_items;
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END $$;

COMMIT;
