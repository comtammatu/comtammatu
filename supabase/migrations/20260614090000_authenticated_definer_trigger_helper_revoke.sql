BEGIN;

-- Keep these helpers reachable only through service_role and the postgres-owned
-- SECURITY DEFINER functions/triggers that already enforce the business gate.
-- Verified callers (production catalog 2026-06-14): each is invoked only by a
-- postgres-owned SECURITY DEFINER routine, so the inner call runs with the
-- definer's privilege and never needs the authenticated grant.
--   compute_user_trust_score <- grn_is_auto_approvable (SECURITY DEFINER)
--   grn_is_auto_approvable    <- try_auto_approve_grn   (SECURITY DEFINER)
--   sync_insurance_base       <- trg_sync_insurance_on_contract (trigger, SECURITY DEFINER)

REVOKE EXECUTE ON FUNCTION public.compute_user_trust_score(uuid, bigint)
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.grn_is_auto_approvable(bigint)
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.sync_insurance_base(bigint)
  FROM authenticated;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.compute_user_trust_score(uuid, bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.grn_is_auto_approvable(bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.sync_insurance_base(bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'revoke incomplete: authenticated still holds EXECUTE on a target helper';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.compute_user_trust_score(uuid, bigint)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.grn_is_auto_approvable(bigint)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.sync_insurance_base(bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'revoke over-reached: service_role lost EXECUTE on a target helper';
  END IF;
END $$;

COMMIT;
