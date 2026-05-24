-- =========================================================================
-- Network Gate — per-agent presence token registry + atomic registration RPC
--
-- Purpose:
--   Replace the global PRINT_AGENT_PRESENCE_TOKEN boundary with a token hash
--   bound to (tenant_id, branch_id, agent_id). The web route hashes the bearer
--   token and calls register_branch_presence() with the server-observed IP.
--
-- Security notes:
--   - Token hashes are kept outside printer_agents because authenticated users
--     can SELECT printer_agents for online status.
--   - The RPC is service_role-only. Browser users cannot mint trusted IPs.
--   - Agent heartbeat never clears branch_trusted_egress_ips.revoked_at.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.printer_agent_presence_tokens (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  token_sha256 TEXT NOT NULL CHECK (token_sha256 ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  UNIQUE (tenant_id, branch_id, agent_id),
  UNIQUE (token_sha256)
);

COMMENT ON TABLE public.printer_agent_presence_tokens IS
  'Service-role-managed token hashes for /api/branch-presence. One active token per branch print-agent tuple.';

COMMENT ON COLUMN public.printer_agent_presence_tokens.token_sha256 IS
  'Lowercase SHA-256 hex digest of the raw agent-local PRINT_AGENT_PRESENCE_TOKEN value.';

CREATE INDEX IF NOT EXISTS idx_printer_agent_presence_tokens_active
  ON public.printer_agent_presence_tokens (tenant_id, branch_id, agent_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.printer_agent_presence_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.printer_agent_presence_tokens
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.printer_agent_presence_tokens TO service_role;
GRANT USAGE, SELECT
  ON SEQUENCE public.printer_agent_presence_tokens_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.register_branch_presence(
  p_tenant_id BIGINT,
  p_branch_id BIGINT,
  p_agent_id TEXT,
  p_token_sha256 TEXT,
  p_ip_address INET
)
RETURNS TABLE(ok BOOLEAN, status TEXT, ip TEXT, skipped BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_token_id BIGINT;
  v_token_revoked_at TIMESTAMPTZ;
  v_agent_branch_id BIGINT;
  v_existing RECORD;
  v_updated_id BIGINT;
BEGIN
  SELECT id, revoked_at
    INTO v_token_id, v_token_revoked_at
  FROM public.printer_agent_presence_tokens
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND agent_id = p_agent_id
    AND token_sha256 = lower(p_token_sha256)
  FOR UPDATE;

  IF v_token_id IS NULL OR v_token_revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'invalid_token', p_ip_address::TEXT, false;
    RETURN;
  END IF;

  UPDATE public.printer_agent_presence_tokens
  SET last_attempt_at = v_now
  WHERE id = v_token_id
    AND (
      last_attempt_at IS NULL
      OR last_attempt_at <= v_now - INTERVAL '30 seconds'
    )
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RETURN QUERY SELECT false, 'rate_limited', p_ip_address::TEXT, false;
    RETURN;
  END IF;

  SELECT branch_id
    INTO v_agent_branch_id
  FROM public.printer_agents
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND agent_id = p_agent_id;

  IF v_agent_branch_id IS NULL THEN
    RETURN QUERY SELECT false, 'agent_not_registered', p_ip_address::TEXT, false;
    RETURN;
  END IF;

  SELECT id, last_seen_at, revoked_at
    INTO v_existing
  FROM public.branch_trusted_egress_ips
  WHERE tenant_id = p_tenant_id
    AND branch_id = p_branch_id
    AND ip_address = p_ip_address
  FOR UPDATE;

  IF v_existing.id IS NOT NULL AND v_existing.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'ip_revoked', p_ip_address::TEXT, false;
    RETURN;
  END IF;

  IF v_existing.id IS NOT NULL
     AND v_existing.last_seen_at > v_now - INTERVAL '60 seconds' THEN
    UPDATE public.printer_agent_presence_tokens
    SET last_used_at = v_now
    WHERE id = v_token_id;

    RETURN QUERY SELECT true, 'skipped', p_ip_address::TEXT, true;
    RETURN;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    v_updated_id := NULL;

    UPDATE public.branch_trusted_egress_ips
    SET
      registered_via = 'agent',
      registered_by_agent_id = p_agent_id,
      last_seen_at = v_now
    WHERE id = v_existing.id
      AND revoked_at IS NULL
    RETURNING id INTO v_updated_id;

    IF v_updated_id IS NULL THEN
      RETURN QUERY SELECT false, 'ip_revoked', p_ip_address::TEXT, false;
      RETURN;
    END IF;
  ELSE
    INSERT INTO public.branch_trusted_egress_ips (
      tenant_id,
      branch_id,
      ip_address,
      registered_via,
      registered_by_agent_id,
      last_seen_at
    )
    VALUES (
      p_tenant_id,
      p_branch_id,
      p_ip_address,
      'agent',
      p_agent_id,
      v_now
    );
  END IF;

  UPDATE public.printer_agent_presence_tokens
  SET last_used_at = v_now
  WHERE id = v_token_id;

  RETURN QUERY SELECT true, 'ok', p_ip_address::TEXT, false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_branch_presence(BIGINT, BIGINT, TEXT, TEXT, INET)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_branch_presence(BIGINT, BIGINT, TEXT, TEXT, INET)
  TO service_role;

COMMENT ON FUNCTION public.register_branch_presence(BIGINT, BIGINT, TEXT, TEXT, INET) IS
  'Service-role-only atomic branch presence registration. Validates per-agent token hash, rate-limits 1/30s, and never clears revoked trusted IP rows.';
