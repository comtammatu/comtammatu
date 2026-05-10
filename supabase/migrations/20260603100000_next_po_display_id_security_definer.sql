-- Fix: next_po_display_id was SECURITY INVOKER but tenant_po_counters has all
-- privileges revoked from authenticated, so callers got "permission denied for
-- table tenant_po_counters". The original migration's intent was clearly
-- "controlled access via the RPC" (its comment: "Read-only via the RPC; no
-- direct DML from authenticated users") — that pattern requires SECURITY
-- DEFINER. Tenant isolation is still enforced by the explicit
-- auth_tenant_id() = p_tenant_id check inside the function body.

CREATE OR REPLACE FUNCTION public.next_po_display_id(
  p_tenant_id BIGINT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year SMALLINT;
  v_seq  BIGINT;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id <= 0 THEN
    RAISE EXCEPTION 'next_po_display_id: invalid tenant_id'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF public.auth_tenant_id() IS NULL OR public.auth_tenant_id() <> p_tenant_id THEN
    RAISE EXCEPTION 'next_po_display_id: tenant scope mismatch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_year := EXTRACT(year FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::SMALLINT;

  INSERT INTO public.tenant_po_counters (tenant_id, year, next_seq, updated_at)
  VALUES (p_tenant_id, v_year, 2, now())
  ON CONFLICT (tenant_id, year) DO UPDATE
    SET next_seq = public.tenant_po_counters.next_seq + 1,
        updated_at = now()
  RETURNING (
    CASE
      WHEN xmax::TEXT::INT = 0 THEN 1
      ELSE public.tenant_po_counters.next_seq - 1
    END
  ) INTO v_seq;

  RETURN 'PO-' || v_year::TEXT || '-' || lpad(v_seq::TEXT, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_po_display_id(BIGINT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.next_po_display_id(BIGINT) FROM anon, public;
