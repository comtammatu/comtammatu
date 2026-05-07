> ARCHIVED 2026-05-07 — v2 naming violates locked principle; capabilities folded into 05-MODULE-CATALOG.md

# Inventory V2 Rebuild — New Supabase Project Contract

> **Status:** PROPOSED — owner chose rebuild onto a new database/project.
> **Decision date:** 2026-05-05
> **Scope:** blue-green Supabase rebuild for Inventory V2, with old project left intact until cutover is accepted.
> **Blocks implementation until:** owner sign-off, data audit, and migration rehearsal on a non-production target.

---

## 0. Decision

Inventory V2 rebuild will **not** rewrite the current production project's migration history in place.

Instead:

1. Keep the current Supabase project as `blue` (source of truth until cutover).
2. Create a new Supabase project/database as `green`.
3. Build a clean full-app schema baseline on `green`, with Inventory V2-only artifacts.
4. Migrate only approved data from `blue` to `green`.
5. Switch application environment variables to `green` during a maintenance window.
6. Keep `blue` read-only as rollback/audit snapshot until owner approves retirement.

This avoids the unsafe path of squashing or archiving migrations against a live project that already has an applied migration ledger.

---

## 1. Non-Negotiables

- Never run destructive cleanup directly on the current production project.
- Never rewrite `supabase_migrations.schema_migrations` on production.
- Never drop audit/tax/accounting data without owner sign-off naming the tables and data classes.
- New project cutover must include Auth, Storage, database, Edge Functions, external workflows, and app env vars.
- App-layer and RPC-layer gates must use Auth v2 permission keys, not legacy `auth_role()` whitelists, except for explicitly documented compatibility helpers.
- `stock_issue(issue_type = kitchen_use)` remains retired. V2 branch warehouse to branch kitchen uses atomic intra-branch `stock_transfer`.
- Full verification must run against `green` before any production traffic points to it.

---

## 2. Why New Project

The current database contains V1 Inventory artifacts that were shipped, partially superseded, and then left latent:

- V1 admin surfaces: trust score, cold-chain UI, express window UI, feature flags UI.
- V1 policy tables/RPCs/MVs: hardblock overrides, express windows, baseline MVs, waste tier helpers, stocktake conflict/recount helpers.
- Mixed role and permission history: V2 permissions exist, but docs still reference legacy RPC blockers.

Cleaning all of this in place would require irreversible `DROP` operations on the active project. A new project makes the rebuild testable before cutover and preserves the old project as an audit snapshot.

---

## 3. Rebuild Shape

### Source (`blue`)

- Current production Supabase project.
- No destructive writes during rebuild.
- Becomes read-only during final maintenance window.
- Retained after cutover for audit and rollback.

### Target (`green`)

- New Supabase project.
- New database URL, anon key, service role key, JWT secret context, storage buckets, cron jobs, and Edge Function secrets.
- Built from a clean baseline migration set, not by replaying every historical V1 migration.

### Application Cutover

- Vercel/app env vars switch from `blue` to `green`.
- Users may need fresh login after cutover depending on Auth migration strategy.
- PWA/service-worker cache must be versioned or cache names changed to avoid stale route shells.

---

## 4. Baseline Principle

This is a **full-app database baseline**, not an Inventory-only SQL file.

Inventory shares data with POS, KDS, Finance, Auth, employee profiles, print agent, notifications, and reporting. The green project must include every table/RPC/policy the app needs, with Inventory V2 replacing V1-only inventory artifacts.

Required baseline groups:

| Group | Treatment |
| --- | --- |
| Auth v2, profiles, positions, staff permissions | Keep and normalize. |
| Branches, areas, tenant, settings | Keep. |
| POS/KDS/order/payment/refund tables and RPCs | Keep. |
| Finance/GL/accounting period tables and RPCs | Keep unless finance owner signs a separate removal. |
| Core Inventory V2 tables/RPCs | Keep/rewrite as V2 baseline. |
| V1 Inventory-only tables/RPCs/MVs | Drop from green baseline after dependency audit. |
| Storage buckets used for tax/audit evidence | Keep or migrate explicitly; do not silently discard. |

---

## 5. Artifact Catalog

### Keep By Default

| Artifact | Reason |
| --- | --- |
| `accounting_periods` / fiscal period controls | Cross-cutting Finance and inventory posting guard. |
| `branch_feature_flags` | Generic rollout infra; strip V1 rows if no longer used. |
| `mv_inventory_stock_current` or V2 equivalent | V2 dashboard/reporting depends on current stock projection. |
| `ingredient_category_review_policy` or V2 replacement | Food-safety manual-review enforcement. |
| `stock_levels`, `stock_movements`, `inventory_locations` | Core V2 ledger. |
| `supplier_invoices`, `supplier_payments` | Keep unless AP/Finance owner explicitly drops AP scope; current code posts GL from supplier payment paths. |
| `supplier_returns`, `supplier_credit_notes` | Drop only after dependency and audit review; they may be Finance/AP-adjacent, not purely UI debt. |
| `storage.objects` evidence buckets | Migrate or snapshot. |

### Drop From Green If Dependency Audit Is Clean

| Artifact | Condition |
| --- | --- |
| `branch_express_window`, express audit/RPCs | Drop if GRN express policy is retired. |
| `grn_hardblock_overrides`, `branch_override_codes` | Drop if hardblock override evidence is either migrated to archive or owner accepts loss. |
| `branch_daily_waste_cap` and tier waste helpers | Drop if V2 keeps only minimal writeoff flow. |
| `supplier_price_list`, `supplier_items` | Drop if procurement price governance is explicitly Phase 3. |
| `user_trust_score`, `compute_user_trust_score` | Drop if owner accepts rebuilding trust from future data. |
| `stocktake_drafts`, `zone_locks`, `stocktake_conflicts`, offline helper tables | Drop if V2 stocktake baseline is simple online stocktake only. |
| `mv_grn_price_baseline`, `mv_inventory_value_ranking` | Drop if variance/ABC policies are retired from pilot. |
| 14 V1 permission keys | Remove from green permission catalog and TypeScript mirror only after no RLS/RPC/action references remain. |

### Rewrite

| Area | Required outcome |
| --- | --- |
| Inventory transfer RPCs | Split create/ship/receive permissions; branch manager cannot ship inter-site outbound. |
| Intra-branch transfer | Atomic branch warehouse to default consumption kitchen location. |
| GRN | Simple V2 receive/WAC/posting path; no express auto-approve dependency. |
| Production | Central kitchen BOM consumption/output, permission-gated by production keys. |
| Stocktake | Core open/count/complete path; no hidden V1 recount/conflict UI unless owner reopens. |
| Auth templates | Use actual repo position codes or migrate casing in a dedicated auth phase. Do not hide casing changes inside Inventory SQL. |

---

## 6. Data Migration Classes

Every table must be classified before F1 starts.

| Class | Meaning | Action |
| --- | --- | --- |
| `MIGRATE` | Required operational/audit data | Transform into green schema. |
| `ARCHIVE_ONLY` | Must be retained but not live in green | Export to immutable dump/storage with checksum. |
| `DROP_ACCEPTED` | Owner accepts loss | Exclude from green and record sign-off. |
| `REBUILD_FROM_SOURCE` | Recomputed from retained source rows | Do not migrate derived rows/MVs. |
| `DEFER_DECISION` | Unclear dependency/audit value | Blocks rebuild until resolved. |

Minimum audit outputs:

- Row counts by table on `blue`.
- Foreign-key/dependency graph for candidate drops.
- Last modified timestamps for candidate drops.
- Storage bucket object counts and total bytes.
- List of functions/RLS policies referencing each candidate drop.
- Owner sign-off table with data class and decision.

---

## 7. Auth And Storage Cutover

Auth is not optional in a new Supabase project.

Choose one Auth strategy before F1:

| Strategy | Tradeoff |
| --- | --- |
| Full project backup/restore into green, then cleanup | Preserves auth users best; cleanup work happens after restore. |
| Auth export/import with Supabase-supported path | Cleaner baseline but may force password reset/session invalidation. |
| Force re-onboarding users | Simplest technically, highest operational friction. |

Storage requirements:

- Recreate buckets and policies on green.
- Copy retained objects from blue.
- Preserve object path conventions used by app code.
- Generate checksums/counts before and after copy.
- Decide whether V1 evidence buckets are live, archive-only, or owner-approved drop.

---

## 8. Phases

| Phase | Goal | Output |
| --- | --- | --- |
| F0 | Owner sign-off + data audit | `inventory-v2-rebuild-data-audit.md`, signed drop/keep catalog. |
| F1 | Green project bootstrap | New Supabase project, env placeholder, secrets inventory, no app traffic. |
| F2 | Full-app V2 baseline | Clean migration set for green, including non-inventory app dependencies. |
| F3 | Inventory V2 RPC/RLS rewrite | Transfer, GRN, production, stocktake, stock ledger RPCs verified on green. |
| F4 | Permission and template cleanup | V2 permission catalog, role templates, grants, generated TS mirror. |
| F5 | App layer cleanup | Remove V1 pages/actions/components; app points to green in staging only. |
| F6 | Data migration rehearsal | Repeatable migration scripts, row-count parity, smoke test on green staging. |
| F7 | Cutover | Freeze blue writes, final backup, migrate delta, switch env vars, smoke. |
| F8 | Stabilization | Monitor, keep blue read-only, document rollback window and retirement date. |

Do not start F7 until F0-F6 are green.

---

## 9. Cutover Runbook

### Pre-Cutover

1. Announce maintenance window.
2. Disable scheduled jobs that can write to blue.
3. Put app into maintenance mode or block mutating routes.
4. Take final blue database backup.
5. Export storage object manifest.
6. Record blue table counts and critical aggregate checks.

### Green Load

1. Apply green baseline migrations.
2. Apply data migration scripts.
3. Copy storage objects.
4. Configure Edge Function secrets and cron jobs.
5. Run `pnpm db:types` against green type source.
6. Run app verification against staging env pointed to green.

### Switch

1. Update production env vars to green Supabase URL/keys.
2. Deploy app.
3. Force PWA cache refresh via cache version/name change.
4. Run smoke tests:
   - login for owner, super_manager, warehouse_manager, production_manager, branch_manager, cashier, chef.
   - GRN receive.
   - CW to CK transfer.
   - production confirm.
   - CK/CW to branch transfer.
   - branch warehouse to kitchen transfer.
   - POS payment stock consumption.
   - stocktake open/count/complete.
5. Keep blue read-only.

---

## 10. Rollback Model

Rollback is time-boxed.

Before any successful writes on green:

- Switch env vars back to blue.
- Redeploy app.
- Unfreeze blue writes.

After writes land on green:

- Rollback requires a delta export from green back to blue or owner accepts losing green-window writes.
- Default stance: no automatic rollback after green accepts writes.
- If rollback-after-write is required, build reverse-delta tooling before F7.

Blue must remain available as read-only snapshot for at least the agreed audit window.

---

## 11. Verification Gates

Baseline gates:

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm lint:copy
pnpm db:types
```

Database gates on green:

```bash
supabase migration list --linked
supabase db lint --linked --schema public,auth,storage --level warning --fail-on warning
```

Required checks:

- No live app import of removed Inventory V1 actions/components.
- No RLS/RPC references to removed V1 permission keys.
- No `kitchen_use` outside historical archive or explicit retired tests.
- No direct client access to materialized views that bypass RLS.
- Persona negative tests for cashier/chef against Inventory routes.
- Before/after stock ledger row evidence for the 4-point V2 operating loop.
- Auth JWT claims include `{ tenant_id, branch_id, user_role }` on green.
- Storage object count/checksum parity for retained buckets.

---

## 12. Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Auth migration breaks login | High | Choose Auth strategy in F0; rehearse in green staging. |
| Finance/AP data accidentally dropped | High | Treat AP tables as keep-by-default unless Finance owner signs removal. |
| RLS leak in rewritten baseline | High | Persona negative tests and RLS policy review before cutover. |
| App still imports removed V1 code | High | Grep + typecheck + build after each cleanup phase. |
| Rollback after green writes is non-trivial | High | Decide whether reverse-delta tooling is required before F7. |
| Storage evidence loss | High | Manifest/checksum retained objects before and after copy. |
| Cron/Edge Function still points to blue | Medium | Secrets inventory and post-cutover smoke checks. |
| PWA cache opens stale V1 page | Medium | Cache version/name change in service worker. |
| Position-code casing migration expands scope | Medium | Keep as separate Auth ADR unless owner explicitly includes it. |

---

## 13. Owner Sign-Off Required

| Decision | Owner answer |
| --- | --- |
| New Supabase project approved | pending |
| Auth migration strategy | pending |
| Maintenance window length | pending |
| Blue read-only retention period | pending |
| Rollback after green writes required? | pending |
| V1 data classes approved for drop/archive/migrate | pending |
| AP/supplier invoice scope keep or drop | pending |
| Position-code casing cleanup included or deferred | pending |

No implementation starts until this table is filled.

---

## 14. Immediate Next Work

1. Produce `docs/worklog/inventory/inventory-v2-rebuild-data-audit.md`.
2. Generate dependency graph for candidate V1 drops.
3. Decide Auth migration strategy.
4. Create green Supabase project for rehearsal only.
5. Draft full-app green baseline migration plan.

---

## 15. References

- `docs/worklog/inventory/inventory-pilot-contract-v2.md`
- `docs/archive/plan/inventory-v2-consolidation.md`
- `docs/plan/inventory-redesign.md`
- `docs/ref/inventory.md`
- `docs/ref/inventory-sop.md`
- `docs/ref/inventory-rbac-matrix.md`
- `docs/ref/inventory-role-handoff.md`
- `tasks/regressions.md`
- `packages/shared/src/auth/permissions.ts`
- `packages/shared/src/auth/module-acl.ts`
