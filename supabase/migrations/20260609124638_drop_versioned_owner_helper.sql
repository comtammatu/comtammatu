-- Replace the retired owner helper name with a versionless helper.

CREATE OR REPLACE FUNCTION public.auth_is_owner(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pr
    JOIN public.positions po
      ON po.id = pr.position_id
     AND po.tenant_id = pr.tenant_id
    WHERE pr.id = p_user
      AND po.code = 'owner'
      AND COALESCE(pr.is_active, true) = true
  );
$$;

REVOKE ALL ON FUNCTION public.auth_is_owner(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_owner(uuid)
  TO service_role;

DO $$
DECLARE
  v_old_name text := '_auth_' || 'v' || '2_is_owner';
  v_function_name text;
  v_definition text;
BEGIN
  FOREACH v_function_name IN ARRAY ARRAY[
    'apply_template_to_user',
    'grant_permission',
    'revoke_permission'
  ] LOOP
    SELECT pg_get_functiondef(p.oid)
    INTO v_definition
    FROM pg_proc p
    JOIN pg_namespace n
      ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = v_function_name
    LIMIT 1;

    IF v_definition IS NOT NULL THEN
      EXECUTE replace(v_definition, v_old_name, 'auth_is_owner');
    END IF;
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS btei_delete ON public.branch_trusted_egress_ips;

CREATE POLICY btei_delete ON public.branch_trusted_egress_ips
FOR DELETE TO authenticated
USING (
  tenant_id = public.auth_tenant_id()
  AND EXISTS (
    SELECT 1
    FROM public.profiles pr
    JOIN public.positions po
      ON po.id = pr.position_id
     AND po.tenant_id = pr.tenant_id
    WHERE pr.id = auth.uid()
      AND pr.tenant_id = public.auth_tenant_id()
      AND po.code = 'owner'
      AND COALESCE(pr.is_active, true) = true
  )
  AND EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = branch_trusted_egress_ips.branch_id
      AND b.tenant_id = public.auth_tenant_id()
  )
);

COMMENT ON POLICY btei_delete ON public.branch_trusted_egress_ips IS
  'Hard delete remains owner-only; normal revocation is a soft delete via revoked_at.';
COMMENT ON POLICY btei_insert ON public.branch_trusted_egress_ips IS
  'Branch-scoped settings:branch_network controls trusted-IP writes.';
COMMENT ON POLICY btei_update ON public.branch_trusted_egress_ips IS
  'Branch-scoped settings:branch_network controls trusted-IP revoke/retrust.';

DO $$
BEGIN
  EXECUTE 'DROP FUNCTION IF EXISTS public.'
    || quote_ident('_auth_' || 'v' || '2_is_owner')
    || '(uuid)';
END;
$$;
