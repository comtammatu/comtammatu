-- GREENFIELD_ONLY: rehearsal SQL for staging jmasiwuqiyedqvyfzhuq; not part of supabase/migrations.
-- ============================================================================
-- Greenfield follow-up hardening
--
-- Make service-only table posture explicit at both the grant and RLS layers,
-- and pin the search_path for the immutable feedback category validator.
-- ============================================================================

DROP POLICY IF EXISTS kitchen_daily_counters_service_only_no_client_access
  ON public.kitchen_daily_counters;
CREATE POLICY kitchen_daily_counters_service_only_no_client_access
  ON public.kitchen_daily_counters
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS printer_agent_presence_tokens_service_only_no_client_access
  ON public.printer_agent_presence_tokens;
CREATE POLICY printer_agent_presence_tokens_service_only_no_client_access
  ON public.printer_agent_presence_tokens
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS tenant_po_counters_service_only_no_client_access
  ON public.tenant_po_counters;
CREATE POLICY tenant_po_counters_service_only_no_client_access
  ON public.tenant_po_counters
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

ALTER FUNCTION public.feedback_validate_categories(text[])
  SET search_path = '';
