-- Proxy-safe active bypass lookup for POS/KDS network gate.
-- Direct table reads from middleware were RLS-sensitive; this RPC is the
-- branch-level source of truth once tenant scope is verified.

CREATE OR REPLACE FUNCTION public.branch_network_gate_bypass_active(
  p_tenant_id bigint,
  p_branch_id bigint
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_bound_session_id bigint;
  v_open_session_id bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF auth_tenant_id() IS DISTINCT FROM p_tenant_id THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.tenant_id = p_tenant_id
  ) THEN
    RETURN false;
  END IF;

  SELECT g.bound_pos_session_id
  INTO v_bound_session_id
  FROM public.branch_network_gate_bypasses g
  WHERE g.tenant_id = p_tenant_id
    AND g.branch_id = p_branch_id
    AND g.revoked_at IS NULL
    AND g.expires_at > now()
  ORDER BY g.activated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_bound_session_id IS NULL THEN
    RETURN true;
  END IF;

  SELECT s.id
  INTO v_open_session_id
  FROM public.pos_sessions s
  WHERE s.id = v_bound_session_id
    AND s.status = 'open'
  LIMIT 1;

  RETURN v_open_session_id IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.branch_network_gate_bypass_active(bigint, bigint) IS
  'Returns whether an owner-activated per-branch network-gate bypass is active for POS/KDS proxy checks. SECURITY DEFINER avoids RLS silent deny on branch_network_gate_bypasses during middleware lookup.';

REVOKE ALL ON FUNCTION public.branch_network_gate_bypass_active(bigint, bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.branch_network_gate_bypass_active(bigint, bigint)
  TO authenticated, service_role;
