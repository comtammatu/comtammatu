-- Migration: finance_targets_write
-- Write gate for monthly revenue targets. Route/read stays finance:view.
-- Accountant receives the key via role_templates + staff_permissions (not a
-- floor template). Owner receives it via tenant_owner binding and the owner
-- template.

INSERT INTO public.permission_keys (key, module, description, scope, is_delegable_to_staff)
VALUES
  ('finance:targets_write', 'finance', 'Ghi chỉ tiêu doanh thu chi nhánh', 'tenant', true)
ON CONFLICT (key) DO UPDATE SET
  is_delegable_to_staff = true,
  description = EXCLUDED.description,
  module = EXCLUDED.module,
  scope = EXCLUDED.scope;

INSERT INTO public.auth_access_role_capabilities (role_code, permission_key)
VALUES ('tenant_owner', 'finance:targets_write')
ON CONFLICT DO NOTHING;

UPDATE public.role_templates
SET permission_keys = ARRAY(
      SELECT DISTINCT unnest(permission_keys || ARRAY['finance:targets_write']::text[])
    ),
    updated_at = now()
WHERE position_code IN ('accountant', 'owner');

INSERT INTO public.staff_permissions (
  user_id,
  tenant_id,
  branch_id,
  permission_key,
  source_template
)
SELECT
  pr.id,
  pr.tenant_id,
  NULL,
  'finance:targets_write',
  rt.id
FROM public.profiles pr
JOIN public.positions po
  ON po.id = pr.position_id
 AND po.tenant_id = pr.tenant_id
JOIN public.role_templates rt
  ON rt.tenant_id = pr.tenant_id
 AND rt.position_code = po.code
WHERE po.code IN ('accountant', 'owner')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.upsert_branch_revenue_targets(
  p_year_month date,
  p_rows jsonb
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
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

  IF NOT public.has_permission_any('finance:targets_write') THEN
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
  'Bulk upsert of monthly Doanh thu thuần targets and reward tiers. Write gate: finance:targets_write.';

CREATE OR REPLACE FUNCTION public.delete_branch_revenue_target(
  p_year_month date,
  p_branch_id bigint
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tenant bigint := public.auth_tenant_id();
  v_month date;
  v_deleted integer := 0;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_permission_any('finance:targets_write') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_year_month IS NULL OR p_branch_id IS NULL OR p_branch_id <= 0 THEN
    RAISE EXCEPTION 'invalid_payload' USING ERRCODE = '22023';
  END IF;

  v_month := date_trunc('month', p_year_month::timestamp)::date;

  DELETE FROM public.branch_revenue_targets
  WHERE tenant_id = v_tenant
    AND branch_id = p_branch_id
    AND year_month = v_month;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted', v_deleted,
    'year_month', v_month,
    'branch_id', p_branch_id
  );
END;
$$;

COMMENT ON FUNCTION public.delete_branch_revenue_target(date, bigint) IS
  'Delete one branch monthly Doanh thu thuần target and reward tiers. Write gate: finance:targets_write.';

DROP POLICY IF EXISTS branch_revenue_targets_insert ON public.branch_revenue_targets;
CREATE POLICY branch_revenue_targets_insert
  ON public.branch_revenue_targets
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:targets_write')
  );

DROP POLICY IF EXISTS branch_revenue_targets_update ON public.branch_revenue_targets;
CREATE POLICY branch_revenue_targets_update
  ON public.branch_revenue_targets
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:targets_write')
  )
  WITH CHECK (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:targets_write')
  );

DROP POLICY IF EXISTS branch_revenue_targets_delete ON public.branch_revenue_targets;
CREATE POLICY branch_revenue_targets_delete
  ON public.branch_revenue_targets
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.auth_tenant_id()
    AND public.has_permission_any('finance:targets_write')
  );
