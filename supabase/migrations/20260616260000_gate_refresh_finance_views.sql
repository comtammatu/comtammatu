BEGIN;

-- refresh_finance_views() is invoked by BOTH the refreshMaterializedViews server
-- action (authenticated, gated on settings:tenant) AND the daily pg_cron job
-- 'refresh-finance-views-daily' (no JWT). Without an internal gate, any logged-in
-- user can call it directly over PostgREST and force three concurrent MV refreshes.
-- Add a gate that requires settings:tenant for AUTHENTICATED callers only; the
-- cron path runs with auth.uid() IS NULL and is intentionally exempt (idiom matches
-- baseline's `auth.uid() IS NOT NULL AND ...` logged-in checks). Body otherwise
-- preserved verbatim from the deployed definition.

CREATE OR REPLACE FUNCTION public.refresh_finance_views()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Authenticated callers must hold settings:tenant (matches the server action);
  -- pg_cron runs with no JWT (auth.uid() IS NULL) and bypasses the check.
  IF auth.uid() IS NOT NULL AND NOT public.has_permission_any('settings:tenant') THEN
    RAISE EXCEPTION 'permission denied: settings:tenant required' USING ERRCODE = '42501';
  END IF;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_daily_revenue;
  INSERT INTO public.mv_refresh_log(view_name, refreshed_at)
    VALUES ('mv_daily_revenue', now())
    ON CONFLICT (view_name) DO UPDATE SET refreshed_at = EXCLUDED.refreshed_at;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_top_items;
  INSERT INTO public.mv_refresh_log(view_name, refreshed_at)
    VALUES ('mv_top_items', now())
    ON CONFLICT (view_name) DO UPDATE SET refreshed_at = EXCLUDED.refreshed_at;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_food_cost;
  INSERT INTO public.mv_refresh_log(view_name, refreshed_at)
    VALUES ('mv_food_cost', now())
    ON CONFLICT (view_name) DO UPDATE SET refreshed_at = EXCLUDED.refreshed_at;
END;
$function$;

DO $$
BEGIN
  IF pg_get_functiondef('public.refresh_finance_views()'::regprocedure) !~ 'settings:tenant' THEN
    RAISE EXCEPTION 'refresh_finance_views gate not applied';
  END IF;
END $$;

COMMIT;
