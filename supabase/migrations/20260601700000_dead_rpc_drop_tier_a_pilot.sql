-- =============================================================
-- M7 — Dead RPC drop: Tier A pilot wave (3 RPCs)
--
-- Driver: 4-agent security audit 2026-05-07. Earlier explore found
-- ~67 RPCs với 0 JS callers. Critic verified ≥3 false positives in
-- 60s spot-check (cleanup_abandoned_payments = pg_cron;
-- weekly_*_report = pg_cron; transition_order_*_status = lifecycle
-- helpers in triggers + RPCs). Methodology rebuilt với 6-channel scan
-- matrix per regression rule RPC-DROP-MUST-SCAN-6-CHANNELS.
--
-- This migration is the **pilot drop wave** validating the new process.
-- Wave size = 3 RPCs (well below ≤10 hard cap), all strictly Tier A
-- (one-shot backfills + private compute helpers with no remaining
-- callers). Rollback inlines full function bodies per
-- RPC-ROLLBACK-MUST-INCLUDE-BODY rule.
--
-- ─── 6-channel scan evidence ────────────────────────────────────
--
-- 1. backfill_permissions_from_role()
--    Origin: 20260422130000_auth_v2_backfill.sql (M2 era backfill)
--    JS callers:        0 (grep apps/ packages/)
--    SQL PERFORM/SELECT: 1 (own DO block in same migration — one-shot apply)
--    Trigger refs:      0
--    RLS policy refs:   0
--    Default/CHECK:     0
--    pg_cron refs:      0
--    Verdict: DEAD — ran during M2 apply, never re-executed.
--
-- 2. _auth_v2_is_tenant_wide_role(TEXT)
--    Origin: 20260422130000_auth_v2_backfill.sql
--    JS callers:        0
--    SQL PERFORM/SELECT: 1 (called only from backfill_permissions_from_role
--                          line 144 — also being dropped here)
--    Trigger refs:      0
--    RLS policy refs:   0
--    Default/CHECK:     0
--    pg_cron refs:      0
--    Verdict: DEAD — sole caller is also dead.
--
-- 3. seed_posting_rules(BIGINT)
--    Origin: 20260419000000_gl_posting_rules.sql
--    JS callers:        0 (note: seed_chart_of_accounts has 1 JS caller and is
--                          KEPT; only seed_posting_rules is dead)
--    SQL PERFORM/SELECT: 1 (own DO block in same migration line 193 — one-shot apply)
--    Trigger refs:      0
--    RLS policy refs:   0
--    Default/CHECK:     0
--    pg_cron refs:      0
--    Verdict: DEAD — ran during apply, posting_rules now seeded permanently.
--
-- ─── Pre-flight existence assertion ─────────────────────────────
-- Per regression rule: refuse to proceed if remaining RPCs already missing
-- (could indicate drift / out-of-band drop). backfill_permissions_from_role
-- was already absent on the Cloud schema when this migration was applied;
-- keep its DROP idempotent and require the two remaining functions below.
-- =============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = '_auth_v2_is_tenant_wide_role'
  ) THEN
    RAISE EXCEPTION 'M7 pre-flight: _auth_v2_is_tenant_wide_role missing — refusing to proceed (drift detected)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'seed_posting_rules'
  ) THEN
    RAISE EXCEPTION 'M7 pre-flight: seed_posting_rules missing — refusing to proceed (drift detected)';
  END IF;
END$$;

-- ─── Drops in dependency order ──────────────────────────────────
-- Drop backfill_permissions_from_role FIRST (it depends on _auth_v2_is_tenant_wide_role).
-- Use exact identity arguments to handle any future overload.
DROP FUNCTION IF EXISTS public.backfill_permissions_from_role();
DROP FUNCTION IF EXISTS public._auth_v2_is_tenant_wide_role(TEXT);
DROP FUNCTION IF EXISTS public.seed_posting_rules(BIGINT);
