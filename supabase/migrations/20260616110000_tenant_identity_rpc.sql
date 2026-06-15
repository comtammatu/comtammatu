-- update_tenant_identity: owner-gated RPC to set HKD legal identity (no UPDATE RLS policy on tenants)

CREATE OR REPLACE FUNCTION public.update_tenant_identity(
  p_legal_name text,
  p_tax_code text,
  p_legal_address text,
  p_representative text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant BIGINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('settings:tenant') THEN
    RAISE EXCEPTION 'permission denied: settings:tenant' USING ERRCODE = '42501';
  END IF;

  v_tenant := public.auth_tenant_id();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = '28000';
  END IF;

  UPDATE public.tenants
  SET legal_name = NULLIF(btrim(p_legal_name), ''),
      tax_code = NULLIF(btrim(p_tax_code), ''),
      legal_address = NULLIF(btrim(p_legal_address), ''),
      representative = NULLIF(btrim(p_representative), ''),
      updated_at = now()
  WHERE id = v_tenant;
END;
$$;

REVOKE ALL ON FUNCTION public.update_tenant_identity(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_tenant_identity(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_tenant_identity(text, text, text, text) TO service_role;
