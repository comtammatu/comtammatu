-- Rebuild profiles branch-required trigger on positions.code mapping.

CREATE OR REPLACE FUNCTION public.check_branch_required()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
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

REVOKE ALL ON FUNCTION public.check_branch_required()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_branch_required()
  TO service_role;

DROP TRIGGER IF EXISTS trg_profiles_branch_required ON public.profiles;

CREATE TRIGGER trg_profiles_branch_required
BEFORE INSERT OR UPDATE OF tenant_id, position_id, branch_id
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.check_branch_required();

DO $$
BEGIN
  EXECUTE 'DROP FUNCTION IF EXISTS public.'
    || quote_ident('_auth_' || 'v' || '2_check_branch_required')
    || '()';
END;
$$;
