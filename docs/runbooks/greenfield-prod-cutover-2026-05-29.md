# Greenfield → Production Cutover Runbook (iexw)

> Status: ready for owner execution. The agent does NOT mutate prod.
> Source-of-truth rehearsal SQL (validated on matu-dev): `supabase/greenfield/migrations/`.
> App side: branch `codex/greenfield-rebuild` (P4 app-TS port + P6 type regen). typecheck 6/6, build 2/2.

## What this does
Apply the validated greenfield changes — security hardening + the legacy role-bridge
removal + index dedup — to live prod `iexwsuaqqenyjiskawoj`. **Option A (in-place
reconciliation)**: prod's schema ends up identical to the matu-dev greenfield; **no
rows move**. Everything below was rehearsed end-to-end on matu-dev: baseline restore =
exact live manifest, the cut verified 10/10 roles, column drop succeeds, repo builds.

## Hard rules
- The agent only ever ran `pg_dump --schema-only` (read-only) on prod. **Owner applies
  every prod DDL/DML manually**, after authoring production-reviewed twins.
- The greenfield rehearsal files carry a `GREENFIELD_ONLY` marker and live under
  `supabase/greenfield/migrations/` — they are blocked from the prod chain by
  `lint:db-boundary`. For prod, **author production-reviewed twins under
  `supabase/migrations/`** with the marker + any `greenfield`/`jmasiwuqiyedqvyfzhuq`
  strings removed (T3 review each), then apply.

## Step 0 — Author prod twins (owner, T3)
From each rehearsal file, create a `supabase/migrations/20260603NNNNNN_*.sql` twin
(timestamps after the current chain head + any in-flight 20260602* migrations),
marker stripped, in this order (the only hard edge is **`..500` before `..700`/`..800`**):
1. `..000`–`..200` source-scoped RLS (supplier_invoice / procurement / supplier_return)
2. `..300` schema hardening (matview Data-API revoke, security_invoker views, RPC allowlist)
3. `..400` internal-table deny policies + function search_path
4. `..500` canonical position codes  ← **must precede ..700/..800**
5. `..600` procurement catalog scope
6. `..700` cut auth path (auth_role/hook/5 RPCs → positions.code)
7. `..800` cut remaining 18 readers (16 POS fns + 2 triggers → positions.code)
8. `..900` **DROP COLUMN legacy_role_code** (irreversible — see Step 3/5)
9. `..1000` drop 2 redundant indexes

## Step 1 — Pre-flight on prod (READ-ONLY, run first)
Resolve any hit via owner data cleanup BEFORE the window:
```sql
-- ..500 collision: any tenant with duplicate codes after the rename?
SELECT tenant_id, code, count(*) FROM positions GROUP BY 1,2 HAVING count(*)>1;  -- expect 0 rows
-- ..700 unmapped active profiles (run AFTER ..500..700 helper exists, or simulate the map):
--   any active profile whose position code is NOT in the staff_role_from_position_code CASE?
SELECT p.id, po.code FROM profiles p JOIN positions po ON po.id=p.position_id
WHERE p.is_active AND po.code NOT IN ('owner','super_manager','executive_assistant','area_manager',
 'branch_manager','chief_accountant','accountant','office','warehouse_head','warehouse_keeper',
 'head_chef','chef','kitchen_helper','cashier','waiter','warehouse_manager','production_manager');  -- expect 0 rows
```

## Step 2 — Pre-drop snapshot (MANDATORY, owner exports + keeps)
The code→role map is **many-to-one (lossy)** — this snapshot is the only precise rollback:
```sql
\copy (SELECT id, legacy_role_code FROM positions) TO 'positions_legacy_role_code_predrop.csv' CSV HEADER;
```

## Step 3 — Apply (owner, short off-peak window)
- The cut needs **near-zero downtime**: `user_role`'s value is invariant across it (canonical
  codes map to the same StaffRole), so stale JWTs stay valid — no forced re-login.
- Only `..500` (UPDATE positions/role_templates/auth.users metadata) and `..900` (brief
  ACCESS EXCLUSIVE lock) want a quiet moment. Avoid 19:00 `auto_close_periods` + overnight crons.
- Apply twins 1→9 in order. **Between ..800 and ..900, run Step 4 guards; only drop if green.**

## Step 4 — Verify on prod (gate the column drop + sign-off)
```sql
-- guard: zero functions/policies still read the column (run BEFORE ..900)
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','private') AND p.prosrc ILIKE '%legacy_role_code%';   -- = 0
SELECT count(*) FROM pg_policy WHERE COALESCE(pg_get_expr(polqual,polrelid),'') ILIKE '%legacy_role_code%'
  OR COALESCE(pg_get_expr(polwithcheck,polrelid),'') ILIKE '%legacy_role_code%';     -- = 0
-- behavioral: hook emits correct user_role per role (sample a few real profiles)
SELECT po.code, (public.custom_access_token_hook(jsonb_build_object('user_id',p.id,'claims','{}'::jsonb))
  ->'claims'->'app_metadata'->>'user_role') FROM profiles p JOIN positions po ON po.id=p.position_id
  WHERE p.is_active LIMIT 20;
-- advisor: matviews not anon/auth selectable; public views security_invoker; internal deny policies present.
```
Also confirm: cron jobs still firing (watch next `refresh_mv_inventory_stock_current` at */5);
providers (Viettel S-Invoice, MoMo, VietQR) fail-closed + smoke an issue/payment in a test branch.

## Step 5 — App deploy
Deploy `codex/greenfield-rebuild` (app-TS port + regenerated types). The JWT contract is
unchanged, so it can ship **before** ..900 (app no longer reads the column) to de-risk.

## Rollback
- **Before ..900 (column still present):** revert the forward twins — `CREATE OR REPLACE`
  the functions back to `legacy_role_code` bodies; restore grants. Cheap, no data loss.
- **After ..900 (irreversible point):** re-add the column, then restore exact prior values
  from the Step-2 snapshot (the map is lossy, so the snapshot — not the inverse map — is the
  only precise restore). Prefer continue-forward unless authz is broken.

## Deferred / not in this cutover (owner decisions)
- **13 dead-RPC candidates** — sign-off + T3, then a separate production-reviewed drop migration.
  See `docs/worklog/greenfield-p5-cleanup-2026-05-29.md`.
- **~231 idx_scan=0 indexes** — re-assess only after a known ≥1 business cycle of prod
  `pg_stat` (current stats are not representative).

## Option B (only if "greenfield" must mean a clean-history *project*)
Parallel rebuild on a new prod from the baseline + data migration + env/DNS cutover +
ADR-0003 reverse-delta (Tier-1 logical replication for revenue tables). Much higher blast
radius; inherits the open `DEFER_DECISION` data-audit items. Recommended only if a clean
migration-history project is a hard requirement — Option A delivers the same schema + security
posture at a fraction of the risk because no rows move.
