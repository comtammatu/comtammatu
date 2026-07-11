SET search_path = '';

-- Destructive. Apply ONLY after the app version that stops calling
-- get_orders_paid_summary (superseded by get_orders_summary in 20260710090000)
-- is deployed to production. Applying it earlier breaks /orders on the running
-- deployment. Down migration in migration-rollback/ recreates the function.
DROP FUNCTION IF EXISTS public.get_orders_paid_summary(text, bigint, date, date);
