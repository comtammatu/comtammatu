BEGIN;

ALTER VIEW public.printer_agent_status SET (security_invoker = true);

COMMENT ON VIEW public.printer_agent_status IS
  'Printer agent fleet status with security_invoker=true so caller RLS on printer_agents is enforced.';

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $$
DECLARE
  v_func RECORD;
  v_signature TEXT;
BEGIN
  FOR v_func IN
    SELECT
      p.oid,
      n.nspname AS schema_name,
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS args,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_exec
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND has_function_privilege('anon', p.oid, 'EXECUTE') = true
  LOOP
    v_signature := format('%I.%I(%s)', v_func.schema_name, v_func.proname, v_func.args);

    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', v_signature);

    IF v_func.auth_exec THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_signature);
    END IF;

    IF v_func.service_exec THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_signature);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  v_func RECORD;
  v_signature TEXT;
  v_service_exec BOOLEAN;
BEGIN
  FOR v_func IN
    SELECT DISTINCT
      p.oid,
      n.nspname AS schema_name,
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS args,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_exec
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_trigger t ON t.tgfoid = p.oid
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND NOT t.tgisinternal
      AND (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
  LOOP
    v_signature := format('%I.%I(%s)', v_func.schema_name, v_func.proname, v_func.args);
    v_service_exec := v_func.service_exec;

    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      v_signature
    );

    IF v_service_exec THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_signature);
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON TABLE public.kitchen_daily_counters FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS kitchen_daily_counters_no_client_access
  ON public.kitchen_daily_counters;
CREATE POLICY kitchen_daily_counters_no_client_access
  ON public.kitchen_daily_counters
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS notification_push_deliveries_no_client_access
  ON public.notification_push_deliveries;
CREATE POLICY notification_push_deliveries_no_client_access
  ON public.notification_push_deliveries
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS printer_agent_presence_tokens_no_client_access
  ON public.printer_agent_presence_tokens;
CREATE POLICY printer_agent_presence_tokens_no_client_access
  ON public.printer_agent_presence_tokens
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS tenant_po_counters_no_client_access
  ON public.tenant_po_counters;
CREATE POLICY tenant_po_counters_no_client_access
  ON public.tenant_po_counters
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMIT;
