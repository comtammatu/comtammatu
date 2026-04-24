-- =============================================================
-- Enable all 6 inventory redesign feature flags on pilot branches
-- =============================================================
-- Branches 1 (Kho Tổng / central_warehouse) + 2 (Đất Đỏ).
-- Run via Supabase Studio → SQL editor, OR via `psql $DATABASE_URL -f <this>`.
-- Idempotent — safe to re-run.
--
-- Flags match `apps/web/app/inventory/_lib/feature-flags.ts` constants.
-- =============================================================

INSERT INTO public.branch_feature_flags (branch_id, flag_key, enabled, enabled_at, notes)
VALUES
  -- Branch 1 — Kho Tổng / central_warehouse
  (1, 'inv_s10_grn_variance',        true, now(), 'pilot rollout 2026-04-24'),
  (1, 'inv_s11_waste_tier',          true, now(), 'pilot rollout 2026-04-24'),
  (1, 'inv_s11_ext_auto_waste',      true, now(), 'S11-ext pilot rollout'),
  (1, 'inv_s12_dashboard_v2',        true, now(), 'pilot rollout'),
  (1, 'inv_s13a_stocktake_v2',       true, now(), 'S13a pilot rollout'),
  (1, 'inv_s13b_stocktake_recount',  true, now(), 'S13b pilot rollout'),
  -- Branch 2 — Đất Đỏ
  (2, 'inv_s10_grn_variance',        true, now(), 'pilot rollout 2026-04-24'),
  (2, 'inv_s11_waste_tier',          true, now(), 'pilot rollout 2026-04-24'),
  (2, 'inv_s11_ext_auto_waste',      true, now(), 'S11-ext pilot rollout'),
  (2, 'inv_s12_dashboard_v2',        true, now(), 'pilot rollout'),
  (2, 'inv_s13a_stocktake_v2',       true, now(), 'S13a pilot rollout'),
  (2, 'inv_s13b_stocktake_recount',  true, now(), 'S13b pilot rollout')
ON CONFLICT (branch_id, flag_key) DO UPDATE
  SET enabled    = EXCLUDED.enabled,
      enabled_at = EXCLUDED.enabled_at,
      notes      = COALESCE(EXCLUDED.notes, public.branch_feature_flags.notes);

-- Verify
SELECT branch_id, flag_key, enabled, enabled_at
  FROM public.branch_feature_flags
 WHERE branch_id IN (1, 2)
   AND flag_key LIKE 'inv_%'
 ORDER BY branch_id, flag_key;
