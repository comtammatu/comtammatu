BEGIN;

-- SECURITY DEFINER RPCs bypass RLS as the function owner, so EXECUTE-able-by-anon
-- is a trust-boundary gap: every legitimate caller runs as `authenticated`.
-- Supabase's bootstrap grants EXECUTE to anon on every new function (ALTER
-- DEFAULT PRIVILEGES FOR ROLE postgres), so these 7 acquired anon EXECUTE
-- implicitly. Six self-guard with an auth.uid() check (defense-in-depth, not
-- exploitable); resolve_gtgt_rate has NO internal guard and takes a
-- caller-supplied tenant id — it is only reached by a definer trigger, never by
-- a role, so revoke it from authenticated too.
--
-- REVOKE is a no-op when the privilege is absent, so this is safe to re-run.

REVOKE EXECUTE ON FUNCTION public.create_order(bigint, bigint, uuid, jsonb, text, bigint, bigint, text, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_order_with_daily_limit_hold(bigint, bigint, uuid, jsonb, text, bigint, bigint, text, uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_finance_dashboard_summary(date, date, bigint) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_orders_for_day(bigint, date) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_revenue_kpis(bigint, date, date) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.update_tenant_identity(text, text, text, text) FROM anon, public;

-- resolve_gtgt_rate: internal (trigger-only), no app caller in any role.
REVOKE EXECUTE ON FUNCTION public.resolve_gtgt_rate(bigint, date) FROM anon, authenticated, public;

-- Source fix: stop new public functions from auto-acquiring anon EXECUTE.
-- Forward-only — strips nothing from the 277 existing functions; all public
-- functions are postgres-owned, so FOR ROLE postgres is the relevant default.
-- authenticated stays the default executor (matches current practice; RLS
-- policies and other definer functions invoke helpers as authenticated).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

DO $$
DECLARE
  v_leak int;
BEGIN
  SELECT count(*) INTO v_leak
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'create_order', 'create_order_with_daily_limit_hold',
      'get_finance_dashboard_summary', 'get_orders_for_day',
      'get_revenue_kpis', 'update_tenant_identity', 'resolve_gtgt_rate'
    )
    AND has_function_privilege('anon', p.oid, 'execute');

  IF v_leak <> 0 THEN
    RAISE EXCEPTION 'anon EXECUTE revoke incomplete: % function(s) still anon-executable', v_leak;
  END IF;

  IF has_function_privilege(
       'authenticated',
       'public.resolve_gtgt_rate(bigint, date)',
       'execute'
     ) THEN
    RAISE EXCEPTION 'resolve_gtgt_rate still authenticated-executable';
  END IF;
END $$;

COMMIT;
