BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.production_orders LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.production_order_items LIMIT 1) THEN
    RAISE EXCEPTION 'production_order_retirement_blocked_nonempty';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_production_orders_central_kitchen_only
  ON public.production_orders;

DROP FUNCTION IF EXISTS public.create_production_order(bigint, text, text, jsonb);
DROP FUNCTION IF EXISTS public.confirm_production_order(bigint);
DROP FUNCTION IF EXISTS public.cancel_production_order(bigint);
DROP FUNCTION IF EXISTS public.ensure_production_order_central_kitchen();

ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_production_order_id_fkey;
ALTER TABLE public.stock_movements DROP COLUMN IF EXISTS production_order_id;

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

DROP TABLE IF EXISTS public.production_order_items;
DROP TABLE IF EXISTS public.production_orders;

COMMIT;
