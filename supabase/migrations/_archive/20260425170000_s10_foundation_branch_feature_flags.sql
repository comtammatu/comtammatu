-- =============================================================
-- S10 Foundation — branch_feature_flags
--
-- Per-branch feature flag storage for UI wiring rollout
-- (Tranche 1-3 inventory redesign). Follows pattern from existing
-- system_settings(key,value) but scoped per-branch for pilot
-- cutover Đất Đỏ + chi nhánh trước khi rollout all branches.
--
-- Flag keys (seeded disabled):
--   inv_s10_grn_variance
--   inv_s11_waste_tier
--   inv_s12_dashboard_v2
--   inv_s13a_stocktake_v2
--   inv_s13b_stocktake_recount
--   inv_s14_auto_approve
--
-- Current docs: docs/ref/inventory.md + docs/modules/web-app.md
-- Regression: tasks/regressions.md (feature flag discipline)
-- =============================================================

CREATE TABLE IF NOT EXISTS public.branch_feature_flags (
  branch_id    BIGINT  NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  flag_key     TEXT    NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT false,
  enabled_by   UUID    REFERENCES auth.users(id),
  enabled_at   TIMESTAMPTZ,
  disabled_at  TIMESTAMPTZ,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (branch_id, flag_key)
);

COMMENT ON TABLE public.branch_feature_flags IS
  'Per-branch feature flag for UI wiring rollout. Flag keys follow convention inv_s{sprint}_{feature}. enabled_at/disabled_at give audit trail. Read via useFeatureFlag() hook from server components.';

CREATE INDEX IF NOT EXISTS idx_branch_feature_flags_enabled
  ON public.branch_feature_flags (branch_id, enabled)
  WHERE enabled = true;

ALTER TABLE public.branch_feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_flags_read_tenant"
  ON public.branch_feature_flags
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.branches b
            WHERE b.id = branch_feature_flags.branch_id
              AND b.tenant_id = public.auth_tenant_id())
  );

CREATE POLICY "feature_flags_write_settings"
  ON public.branch_feature_flags
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.branches b
            WHERE b.id = branch_feature_flags.branch_id
              AND b.tenant_id = public.auth_tenant_id())
    AND (public.has_permission(branch_feature_flags.branch_id, 'settings:branch')
         OR public.has_permission(NULL, 'settings:tenant'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.branches b
            WHERE b.id = branch_feature_flags.branch_id
              AND b.tenant_id = public.auth_tenant_id())
    AND (public.has_permission(branch_feature_flags.branch_id, 'settings:branch')
         OR public.has_permission(NULL, 'settings:tenant'))
  );

-- Seed flag keys (disabled by default) for all active branches
INSERT INTO public.branch_feature_flags (branch_id, flag_key, enabled)
SELECT b.id, fk.flag_key, false
FROM public.branches b
CROSS JOIN (VALUES
  ('inv_s10_grn_variance'),
  ('inv_s11_waste_tier'),
  ('inv_s12_dashboard_v2'),
  ('inv_s13a_stocktake_v2'),
  ('inv_s13b_stocktake_recount'),
  ('inv_s14_auto_approve')
) AS fk(flag_key)
WHERE b.is_active = true
ON CONFLICT (branch_id, flag_key) DO NOTHING;

-- Helper: check flag for a given branch
CREATE OR REPLACE FUNCTION public.is_feature_enabled(
  p_branch_id BIGINT,
  p_flag_key  TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT enabled FROM public.branch_feature_flags
      WHERE branch_id = p_branch_id AND flag_key = p_flag_key),
    false
  );
$function$;

GRANT EXECUTE ON FUNCTION public.is_feature_enabled(BIGINT, TEXT) TO authenticated;
