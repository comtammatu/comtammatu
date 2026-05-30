-- =============================================================
-- WS-4 naming cleanup: de-version the S13A stocktake feature flag
--
--   inv_s13a_stocktake_v2  ->  inv_stocktake_redesigned
--
-- The redesigned stocktake graduated from "v2 pilot" to the default
-- inventory surface; the s13a/v2 sprint-version naming is now legacy.
--
-- Pairs with TS constant rename S13A_STOCKTAKE_V2 -> INVENTORY_STOCKTAKE_REDESIGNED
-- in apps/web/app/(protected)/inventory/_lib/feature-flags.ts.
-- The is_feature_enabled(branch_id, flag_key) RPC is generic (no hardcoded
-- key) so it needs no change; only the stored flag_key value moves.
--
-- ⚠️ PRODUCTION ORDERING: apply this migration BEFORE (or in the same release
-- as) deploying the code that reads 'inv_stocktake_redesigned'. Until applied,
-- is_feature_enabled() returns false for the new key and the redesigned
-- stocktake UI is gated off for branches that had it enabled (fail-safe).
--
-- Validated 2026-05-29 on dev sandbox matu-dev (nikkridjukdbqvkvqlmi):
-- 4 rows renamed, 0 leftover on old key, 4 distinct branches (no PK conflict),
-- is_feature_enabled() resolves cleanly on the new key.
-- =============================================================

UPDATE public.branch_feature_flags
SET flag_key = 'inv_stocktake_redesigned',
    updated_at = now()
WHERE flag_key = 'inv_s13a_stocktake_v2';
