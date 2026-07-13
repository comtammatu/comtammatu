-- D078 follow-up: POS sale outcomes deduct from the branch warehouse by default.
-- Apply after 20260710220000_single_warehouse_retire_branch_kitchen.sql.

SET search_path = '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.branch_kind = 'branch'
      AND b.is_active = TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM public.inventory_locations il
        WHERE il.tenant_id = b.tenant_id
          AND il.branch_id = b.id
          AND il.location_kind = 'warehouse'
          AND il.is_active = TRUE
      )
  ) THEN
    RAISE EXCEPTION 'branch_warehouse_required_before_pos_stock_outcome_enable'
      USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory_locations il
    JOIN public.branches b
      ON b.id = il.branch_id
     AND b.tenant_id = il.tenant_id
    WHERE b.branch_kind = 'branch'
      AND b.is_active = TRUE
      AND il.location_kind = 'kitchen'
      AND il.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'branch_kitchen_must_be_retired_before_pos_stock_outcome_enable'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

INSERT INTO public.branch_feature_flags (
  branch_id,
  flag_key,
  enabled,
  enabled_at,
  disabled_at,
  updated_at
)
SELECT
  b.id,
  'pos_stock_outcome_posting',
  TRUE,
  now(),
  NULL,
  now()
FROM public.branches b
WHERE b.branch_kind = 'branch'
  AND b.is_active = TRUE
ON CONFLICT (branch_id, flag_key) DO UPDATE
SET
  enabled = TRUE,
  enabled_by = NULL,
  enabled_at = CASE
    WHEN public.branch_feature_flags.enabled THEN COALESCE(public.branch_feature_flags.enabled_at, now())
    ELSE now()
  END,
  disabled_at = NULL,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.trg_ensure_branch_inventory_location_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.branch_kind = 'branch' THEN
    PERFORM public.ensure_branch_inventory_location_defaults(NEW.tenant_id, NEW.id);

    INSERT INTO public.branch_feature_flags (
      branch_id,
      flag_key,
      enabled,
      enabled_at,
      disabled_at,
      updated_at
    )
    VALUES (
      NEW.id,
      'pos_stock_outcome_posting',
      TRUE,
      now(),
      NULL,
      now()
    )
    ON CONFLICT (branch_id, flag_key) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_ensure_branch_inventory_location_defaults()
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.trg_ensure_branch_inventory_location_defaults() TO service_role;
