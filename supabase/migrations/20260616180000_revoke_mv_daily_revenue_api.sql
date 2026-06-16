BEGIN;

-- Materialized views ignore RLS: any role with SELECT reads every tenant/branch
-- row. mv_daily_revenue is exposed in the PostgREST API with SELECT to anon AND
-- authenticated (acquired via the baseline TABLES default-privilege grant, and
-- re-acquired when 20260616100000 recreated the MV), so an unauthenticated
-- caller can read aggregated daily revenue directly. All legitimate reads go
-- through the auth-gated SECURITY DEFINER getters (get_revenue_kpis,
-- get_finance_dashboard_summary); nothing reads the MV over PostgREST. Revoke
-- it from the API roles. The cron refresh runs as the postgres owner and is
-- unaffected. If a direct authenticated read is ever needed, add a definer
-- getter gated on finance:view rather than re-exposing the MV.
--
-- NOTE: a future CREATE/REPLACE of this MV re-acquires the default grant; keep
-- the REVOKE in the same migration as any future redefinition.

REVOKE SELECT ON public.mv_daily_revenue FROM anon, authenticated;

DO $$
BEGIN
  IF has_table_privilege('anon', 'public.mv_daily_revenue', 'SELECT')
     OR has_table_privilege('authenticated', 'public.mv_daily_revenue', 'SELECT') THEN
    RAISE EXCEPTION 'mv_daily_revenue still SELECT-able by an API role';
  END IF;
END $$;

COMMIT;
