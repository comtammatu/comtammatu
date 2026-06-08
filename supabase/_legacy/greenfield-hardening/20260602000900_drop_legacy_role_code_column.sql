-- GREENFIELD_ONLY: rehearsal SQL for the greenfield role-bridge cut; not part of supabase/migrations.
-- =============================================================
-- IRREVERSIBLE: drop positions.legacy_role_code. Apply LAST, only after:
--   1. 20260602000700 (auth path) + 20260602000800 (18 POS/trigger fns) are applied.
--   2. Guard is green:
--        SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--          WHERE n.nspname IN ('public','private') AND p.prosrc ILIKE '%legacy_role_code%';  -- = 0
--        SELECT count(*) FROM pg_policy
--          WHERE COALESCE(pg_get_expr(polqual, polrelid),'') ILIKE '%legacy_role_code%'
--             OR COALESCE(pg_get_expr(polwithcheck, polrelid),'') ILIKE '%legacy_role_code%'; -- = 0
--        git grep legacy_role_code apps/ packages/  -- = 0 (excluding generated database.types.ts)
--   3. (PRODUCTION) export a pre-drop snapshot first — the position-code → role map is
--      many-to-one (lossy), so this snapshot is the only precise rollback path:
--        SELECT id, legacy_role_code FROM public.positions;
--
-- Verified on dev sandbox matu-dev: drop succeeds and the JWT hook still emits the
-- correct user_role for all 10 StaffRoles (10/10) — authz now derives from positions.code.
-- =============================================================

ALTER TABLE public.positions DROP COLUMN IF EXISTS legacy_role_code;
