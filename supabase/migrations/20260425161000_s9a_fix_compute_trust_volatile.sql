-- =============================================================
-- S9-a Patch — compute_user_trust_score volatility fix
--
-- S9 declared the function STABLE but it performs INSERT/UPDATE
-- on user_trust_score for caching. PostgreSQL rejects with
-- "INSERT is not allowed in a non-volatile function". Re-issue
-- the same body as VOLATILE (the default — drop STABLE keyword).
--
-- This migration has been applied to the dev DB directly via
-- MCP apply_migration. This file restores parity between the
-- local filesystem and remote schema_migrations for fresh
-- `supabase db reset` runs.
-- =============================================================

CREATE OR REPLACE FUNCTION public.compute_user_trust_score(
  p_user_id   UUID,
  p_branch_id BIGINT
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant     BIGINT;
  v_good_grn   INT;
  v_incidents  INT;
  v_score      NUMERIC;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.branches WHERE id = p_branch_id;
  IF v_tenant IS NULL THEN RETURN 50; END IF;

  SELECT COUNT(*) INTO v_good_grn
    FROM public.goods_received_notes
   WHERE created_by = p_user_id
     AND branch_id  = p_branch_id
     AND status     = 'confirmed'
     AND received_date > now() - INTERVAL '60 days';

  SELECT COUNT(*) INTO v_incidents
    FROM public.grn_hardblock_overrides
   WHERE overridden_by = p_user_id
     AND branch_id     = p_branch_id
     AND overridden_at > now() - INTERVAL '60 days';

  IF v_good_grn < 20 THEN
    v_score := 50 + v_good_grn * 1.0 - v_incidents * 20;
  ELSE
    v_score := 70 + (v_good_grn - 20) * 0.5 - v_incidents * 20;
  END IF;

  IF v_incidents > 0 THEN
    v_score := LEAST(v_score, 85);
  END IF;

  v_score := GREATEST(0, LEAST(100, v_score))::NUMERIC(5,2);

  INSERT INTO public.user_trust_score (
    tenant_id, branch_id, user_id, score, grn_count_30d,
    variance_incidents_30d, last_incident_at, updated_at
  )
  VALUES (
    v_tenant, p_branch_id, p_user_id, v_score, v_good_grn, v_incidents,
    (SELECT MAX(overridden_at) FROM public.grn_hardblock_overrides
      WHERE overridden_by = p_user_id AND branch_id = p_branch_id
        AND overridden_at > now() - INTERVAL '60 days'),
    now()
  )
  ON CONFLICT (tenant_id, branch_id, user_id) DO UPDATE
    SET score                  = EXCLUDED.score,
        grn_count_30d          = EXCLUDED.grn_count_30d,
        variance_incidents_30d = EXCLUDED.variance_incidents_30d,
        last_incident_at       = EXCLUDED.last_incident_at,
        updated_at             = EXCLUDED.updated_at;

  RETURN v_score;
END;
$function$;

COMMENT ON FUNCTION public.compute_user_trust_score(UUID, BIGINT) IS
  'Q4b real formula, VOLATILE (writes cache). Warmup 50+n (first 20 clean/60d), post 70+(n-20)*0.5, incident -20, cap 85 if incident. Threshold 70 for auto-approve.';

GRANT EXECUTE ON FUNCTION public.compute_user_trust_score(UUID, BIGINT) TO authenticated;
