-- Let service-role profile maintenance pass the branch-required trigger.
-- The trigger reads the private position mapper, so it must run as definer.

CREATE OR REPLACE FUNCTION public.check_branch_required()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_access_bucket text;
BEGIN
  SELECT private.staff_role_from_position_code(po.code)
  INTO v_access_bucket
  FROM public.positions po
  WHERE po.id = NEW.position_id
    AND po.tenant_id = NEW.tenant_id;

  IF v_access_bucket IN (
    'cashier',
    'waiter',
    'chef',
    'branch_manager',
    'warehouse_manager',
    'production_manager'
  )
  AND NEW.branch_id IS NULL THEN
    RAISE EXCEPTION 'branch_required_for_operational_position: position_id=%', NEW.position_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_branch_required() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_branch_required() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_branch_required() TO service_role;

COMMENT ON FUNCTION public.check_branch_required() IS
  'Profiles branch-required guard. SECURITY DEFINER because it uses the private staff-role mapper.';
