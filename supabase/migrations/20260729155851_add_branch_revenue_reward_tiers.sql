-- Owner-configured reward tiers for each branch monthly revenue target.

ALTER TABLE public.branch_revenue_targets
  ADD COLUMN reward_tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT branch_revenue_targets_reward_tiers_shape_check
    CHECK (
      jsonb_typeof(reward_tiers) = 'array'
      AND jsonb_array_length(reward_tiers) <= 10
    );

COMMENT ON COLUMN public.branch_revenue_targets.reward_tiers IS
  'Ordered non-cumulative KPI reward tiers. Each tier has threshold_pct, reward_type, and reward_value.';

REVOKE SELECT ON TABLE public.branch_revenue_targets FROM authenticated;
GRANT SELECT (
  id,
  tenant_id,
  branch_id,
  year_month,
  target_amount,
  created_at,
  updated_at,
  updated_by
) ON TABLE public.branch_revenue_targets TO authenticated;

CREATE OR REPLACE FUNCTION private.branch_revenue_targets_enforce_branch_kind()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_kind text;
  v_tenant bigint;
  v_tier jsonb;
  v_threshold numeric;
  v_reward_type text;
  v_reward_value numeric;
  v_thresholds numeric[] := ARRAY[]::numeric[];
BEGIN
  SELECT b.branch_kind, b.tenant_id
  INTO v_kind, v_tenant
  FROM public.branches b
  WHERE b.id = NEW.branch_id;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'branch_not_found' USING ERRCODE = '22023';
  END IF;

  IF v_kind <> 'branch' THEN
    RAISE EXCEPTION 'branch_kind_not_allowed' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(NEW.reward_tiers) <> 'array'
     OR jsonb_array_length(NEW.reward_tiers) > 10 THEN
    RAISE EXCEPTION 'invalid_reward_tiers' USING ERRCODE = '22023';
  END IF;

  FOR v_tier IN SELECT value FROM jsonb_array_elements(NEW.reward_tiers)
  LOOP
    IF jsonb_typeof(v_tier) <> 'object'
       OR NOT (v_tier ?& ARRAY['threshold_pct', 'reward_type', 'reward_value'])
       OR v_tier - ARRAY['threshold_pct', 'reward_type', 'reward_value']::text[]
          <> '{}'::jsonb
       OR jsonb_typeof(v_tier -> 'threshold_pct') <> 'number'
       OR jsonb_typeof(v_tier -> 'reward_type') <> 'string'
       OR jsonb_typeof(v_tier -> 'reward_value') <> 'number' THEN
      RAISE EXCEPTION 'invalid_reward_tier' USING ERRCODE = '22023';
    END IF;

    v_threshold := (v_tier ->> 'threshold_pct')::numeric;
    v_reward_type := v_tier ->> 'reward_type';
    v_reward_value := (v_tier ->> 'reward_value')::numeric;

    IF v_threshold <= 0
       OR v_threshold > 1000
       OR v_threshold = ANY(v_thresholds)
       OR v_reward_type NOT IN ('fixed_amount', 'revenue_percent')
       OR v_reward_value <= 0
       OR (
         v_reward_type = 'fixed_amount'
         AND (
           v_reward_value > 1000000000000
           OR v_reward_value <> trunc(v_reward_value)
         )
       )
       OR (
         v_reward_type = 'revenue_percent'
         AND v_reward_value > 100
       ) THEN
      RAISE EXCEPTION 'invalid_reward_tier' USING ERRCODE = '22023';
    END IF;

    v_thresholds := array_append(v_thresholds, v_threshold);
  END LOOP;

  NEW.reward_tiers := (
    SELECT COALESCE(jsonb_agg(tier ORDER BY (tier ->> 'threshold_pct')::numeric), '[]'::jsonb)
    FROM jsonb_array_elements(NEW.reward_tiers) AS tier
  );
  NEW.tenant_id := v_tenant;
  NEW.updated_at := now();
  RETURN NEW;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'invalid_reward_tier' USING ERRCODE = '22023';
END;
$$;

DROP TRIGGER branch_revenue_targets_enforce_branch_kind
  ON public.branch_revenue_targets;

CREATE TRIGGER branch_revenue_targets_enforce_branch_kind
  BEFORE INSERT OR UPDATE OF branch_id, year_month, target_amount, reward_tiers
  ON public.branch_revenue_targets
  FOR EACH ROW
  EXECUTE FUNCTION private.branch_revenue_targets_enforce_branch_kind();

CREATE OR REPLACE FUNCTION public.list_branch_revenue_target_reward_tiers(
  p_year_month date
)
RETURNS TABLE (
  branch_id bigint,
  reward_tiers jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_month date;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.auth_is_owner(v_uid)
     OR NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_year_month IS NULL THEN
    RAISE EXCEPTION 'invalid_year_month' USING ERRCODE = '22023';
  END IF;

  v_month := date_trunc('month', p_year_month::timestamp)::date;

  RETURN QUERY
  SELECT targets.branch_id, targets.reward_tiers
  FROM public.branch_revenue_targets targets
  WHERE targets.tenant_id = v_tenant
    AND targets.year_month = v_month;
END;
$$;

COMMENT ON FUNCTION public.list_branch_revenue_target_reward_tiers(date) IS
  'Owner-only reward tier configuration for branch monthly revenue targets.';

CREATE OR REPLACE FUNCTION public.upsert_branch_revenue_targets(
  p_year_month date,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_month date;
  v_updated integer := 0;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.auth_is_owner(v_uid)
     OR NOT public.has_permission_any('finance:view') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_year_month IS NULL OR p_rows IS NULL
     OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) < 1
     OR jsonb_array_length(p_rows) > 200 THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023';
  END IF;

  v_month := date_trunc('month', p_year_month::timestamp)::date;

  WITH incoming AS (
    SELECT
      (row_data ->> 'branch_id')::bigint AS branch_id,
      (row_data ->> 'target_amount')::numeric AS target_amount,
      COALESCE(row_data -> 'reward_tiers', '[]'::jsonb) AS reward_tiers
    FROM jsonb_array_elements(p_rows) AS row_data
  ),
  validated AS (
    SELECT
      incoming.branch_id,
      incoming.target_amount,
      incoming.reward_tiers
    FROM incoming
    JOIN public.branches b
      ON b.id = incoming.branch_id
     AND b.tenant_id = v_tenant
     AND b.branch_kind = 'branch'
     AND b.is_active IS TRUE
    WHERE incoming.branch_id IS NOT NULL
      AND incoming.target_amount IS NOT NULL
      AND incoming.target_amount > 0
  ),
  upserted AS (
    INSERT INTO public.branch_revenue_targets AS t (
      tenant_id,
      branch_id,
      year_month,
      target_amount,
      reward_tiers,
      updated_by
    )
    SELECT
      v_tenant,
      validated.branch_id,
      v_month,
      round(validated.target_amount, 0),
      validated.reward_tiers,
      v_uid
    FROM validated
    ON CONFLICT (branch_id, year_month)
    DO UPDATE SET
      target_amount = EXCLUDED.target_amount,
      reward_tiers = EXCLUDED.reward_tiers,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
    RETURNING t.id
  )
  SELECT count(*)::integer INTO v_updated FROM upserted;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'no_valid_rows' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'updated', v_updated,
    'year_month', v_month
  );
END;
$$;

COMMENT ON FUNCTION public.upsert_branch_revenue_targets(date, jsonb) IS
  'Owner-only bulk upsert of monthly Doanh thu thuần targets and reward tiers per branch.';

REVOKE ALL ON FUNCTION public.upsert_branch_revenue_targets(date, jsonb)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_branch_revenue_target_reward_tiers(date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_branch_revenue_targets(date, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_branch_revenue_target_reward_tiers(date)
  TO authenticated, service_role;
