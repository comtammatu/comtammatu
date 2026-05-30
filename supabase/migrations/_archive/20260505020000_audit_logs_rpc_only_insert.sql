-- =========================================================================
-- audit_logs: lock down INSERT to a SECURITY DEFINER RPC
--
-- Original policy (20260416000000) was:
--   CREATE POLICY "audit_logs_insert" ... WITH CHECK (tenant_id = auth_tenant_id())
-- Any authenticated user (cashier, waiter) could `POST /rest/v1/audit_logs`
-- with arbitrary action / entity_type / entity_id / user_id to forge or
-- smear audit history (e.g. fake "owner cancelled invoice 123").
--
-- Fix: drop the broad INSERT policy, REVOKE INSERT, and expose
-- `public.log_audit(...)` as the only path. The RPC forces:
--   - user_id = auth.uid()
--   - tenant_id = auth_tenant_id()
-- so callers cannot lie about who they are or which tenant they belong to.
--
-- Found during M6 security review 2026-04-27. See tasks/regressions.md
-- AUDIT-LOG-INSERT-RPC-ONLY rule.
-- =========================================================================

-- ─── 1. Lock down direct INSERT path ────────────────────────────────────

DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
REVOKE INSERT ON TABLE public.audit_logs FROM authenticated;

-- ─── 2. SECURITY DEFINER RPC ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_audit(
  p_action       TEXT,
  p_entity_type  TEXT,
  p_entity_id    BIGINT DEFAULT NULL,
  p_old          JSONB  DEFAULT NULL,
  p_new          JSONB  DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id   UUID   := auth.uid();
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_id        BIGINT;
BEGIN
  -- Reject anonymous / missing-claim callers — append-only audit must
  -- always have a real actor.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'audit.log_audit: anonymous caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'audit.log_audit: missing tenant_id claim'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_action IS NULL OR length(p_action) = 0 THEN
    RAISE EXCEPTION 'audit.log_audit: action required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_entity_type IS NULL OR length(p_entity_type) = 0 THEN
    RAISE EXCEPTION 'audit.log_audit: entity_type required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO public.audit_logs (
    tenant_id,
    user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data
  ) VALUES (
    v_tenant_id,
    v_user_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_old,
    p_new
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.log_audit(TEXT, TEXT, BIGINT, JSONB, JSONB) IS
  'Append a row to audit_logs. tenant_id and user_id are forced server-side from auth claims — callers cannot spoof them. Only path to write audit_logs (direct INSERT revoked).';

-- Function is SECURITY DEFINER — internal forced fields make it safe to
-- expose to all authenticated users.
GRANT EXECUTE ON FUNCTION public.log_audit(TEXT, TEXT, BIGINT, JSONB, JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.log_audit(TEXT, TEXT, BIGINT, JSONB, JSONB) FROM anon, public;
