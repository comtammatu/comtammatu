-- =========================================================================
-- Employee self-service: update_my_dependents_count(count)
--
-- Allows an authenticated employee to update their own
-- `employees.dependents_count` (affects PIT calculation). RLS would
-- otherwise require hr:manage_employee — operational employees don't
-- carry that key, so we expose a narrow SECURITY DEFINER RPC with
-- strict guards: must own the target row, count in [0, 20], audit log.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.update_my_dependents_count(
  p_count INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant_id BIGINT := public.auth_tenant_id();
  v_user_id   UUID   := auth.uid();
  v_emp_id    BIGINT;
  v_old       INTEGER;
BEGIN
  IF v_user_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'update_my_dependents_count: missing auth context'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_count IS NULL OR p_count < 0 OR p_count > 20 THEN
    RAISE EXCEPTION 'update_my_dependents_count: invalid count'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, dependents_count INTO v_emp_id, v_old
  FROM public.employees
  WHERE profile_id = v_user_id
    AND tenant_id = v_tenant_id
    AND is_active = true
  LIMIT 1;

  IF v_emp_id IS NULL THEN
    RAISE EXCEPTION 'update_my_dependents_count: no active employee record'
      USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.employees
  SET dependents_count = p_count,
      updated_at = now()
  WHERE id = v_emp_id;

  PERFORM public.log_audit(
    'update'::TEXT,
    'employee'::TEXT,
    v_emp_id,
    jsonb_build_object('dependents_count', v_old),
    jsonb_build_object('dependents_count', p_count, 'self_service', true)
  );
END;
$$;

COMMENT ON FUNCTION public.update_my_dependents_count(INTEGER) IS
  'Self-service: employee updates own dependents_count. Affects PIT. SECURITY DEFINER bypasses employees_write RLS; guarded by profile_id = auth.uid() and count in [0, 20].';

GRANT EXECUTE ON FUNCTION public.update_my_dependents_count(INTEGER) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_my_dependents_count(INTEGER) FROM anon, public;
