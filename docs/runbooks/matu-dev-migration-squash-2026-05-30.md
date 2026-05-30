# matu-dev Migration Squash / Baseline Consolidation Runbook

> Status: PLAN — not executed. Owner-gated execution.
> Target: `matu-dev` / `nikkridjukdbqvkvqlmi` ONLY. Production (`iexwsuaqqenyjiskawoj`) is NOT touched.
> Canonical design: `docs/plan/live-schema-first-baseline-extraction.md`
> Toolchain + safety rails: `docs/runbooks/supabase-greenfield-baseline.md` (reuse — do not duplicate)
> Owner directive 2026-05-30: matu-dev may be rebuilt ("không cần giữ nguyên").

## Goal

Replace the 378-file `supabase/migrations/` chain with a single clean, **replayable** baseline, proven by rebuilding `matu-dev` from it end-to-end. This is the "tối ưu migration" ask.

## Why (the problem this solves)

- The 378-file chain **cannot replay from an empty DB**: `20260508055046_hddt_summary_rpcs.sql` references `order_items.vat_rate` before `20260509000000_finance_phase1_5_vat_per_line.sql` creates it (see `docs/plan/supabase-local-baseline-replay.md`). So no env can be stood up from migrations alone.
- Migration-history drift (prod had ~393 applied vs 363–378 local + a duplicate version).
- Accumulated cruft. Phase 1 (2026-05-30) already deduped RLS policies; the baseline should be cut from the **cleaned** schema.

## Prerequisites / feasibility (do FIRST, this is the main gap)

1. **Docker running** (required by `supabase db start` for `db:baseline:local-check`).
2. **Direct privileged connection to matu-dev** — `db:baseline:extract` builds a direct `--db-url`, NOT `--linked`. ⚠️ `--linked` SILENTLY DROPS 18 RLS-restricted tables (verified 2026-05-30, see greenfield-baseline runbook Safety Rails). The script currently reads `supabase/.temp/pooler-url` + `SUPABASE_PASSWORD_IEXW`. **For matu-dev you must supply the matu-dev pooler URL + a matu-dev DB password** (e.g. `SUPABASE_PASSWORD_MATU_DEV` in `.env.local` and a matu-dev `pooler-url`); confirm `scripts/supabase-baseline-extract.mjs` accepts a target override or add one. Do not relink the repo's source project.
3. **Phase 1 cleanup applied to matu-dev** — migrations `20260602008000` / `009000` / `010000` (payroll RLS, attendance revoke, RLS dedup) are already applied (done 2026-05-30). The baseline must capture this state.
4. Confirm target ref is `nikkridjukdbqvkvqlmi` (matu-dev) in every command's output before running it.

## Feasibility check — result (2026-05-30)

Ran the prerequisite/feasibility pass (read-only). Outcome:

- ✅ **Complete extract is achievable.** A privileged connection (the Supabase MCP management role) sees all **118** public tables, so a direct-connection dump avoids the `--linked` 18-table silent-drop bug. The extract script already refuses `--linked` and requires a direct URL.
- ✅ **Replay is structurally sound.** A `pg_dump`-based baseline is ordered by object dependency, so it inherently avoids the hand-written-migration ordering bug (`vat_rate`) that breaks the 378-chain.
- ✅ **Acceptance manifest captured** (post-Phase-1, see Step 0 below).
- ✅ **matu-dev credentials — RESOLVED 2026-05-30.** Owner confirmed `SUPABASE_PASSWORD` in `.env.local` is the matu-dev DB password.
- ✅ **Docker NOT required — EXTRACT DONE Docker-free 2026-05-30.** The Supabase CLI wraps pg_dump in Docker, but the already-installed `libpq` pg_dump (18.3, at `$(brew --prefix libpq)/bin/pg_dump`) dumps matu-dev directly through the session pooler — no Docker. `pg_dump --schema-only --schema=public --no-owner` (PGPASSWORD from `.env.local` `SUPABASE_PASSWORD`, never on the command line) produced a faithful **118-table** artifact (1.46 MB) that reflects the Phase-1-cleaned state (dropped policies `sti_*`/`pp_*`/`attendance_*self*` absent; attendance INSERT-revoke present — authenticated/anon grants have no INSERT). Object counts match the manifest (118 tables / 279 fns / 273 public policies; 329 `CREATE INDEX` + the rest as PK/UNIQUE constraints). MINIMAL managed-surface noise: **0** publications / event triggers / extensions (excluded by `--schema=public`), **0** `OWNER TO` (via `--no-owner`). Only 2 trivial fixups needed for fresh-Supabase replay: `CREATE SCHEMA public;` → `CREATE SCHEMA IF NOT EXISTS public;`, and strip the 2 psql `\restrict`/`\unrestrict` meta-lines (pg_dump 18). → **Toolchain action:** add a Docker-free libpq-pg_dump engine to `scripts/supabase-baseline-extract.mjs` (default), keep the CLI path as fallback.
- ⏳ **Replay confirmation** is the only remaining validation: apply the baseline to an EMPTY target. pg_dump output is dependency-ordered, so it is structurally replayable (the property the 378-chain lacks). Pick a target — both Docker-free: (A) a Supabase **branch** (MCP, ephemeral, non-destructive); or (B) **rebuild matu-dev's public schema** from the baseline (destructive to matu-dev data; owner OK'd "không cần giữ nguyên"; doubles as Phase-2 Step 4). Recommended: prove on a branch first (safe), then rebuild matu-dev.

## Step 0 — Pre-flight manifest (acceptance baseline)

Capture the CURRENT matu-dev shape as the reconciliation target (read-only):

```sql
-- via Supabase MCP execute_sql on nikkridjukdbqvkvqlmi
select
 (select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE') tables,   -- 118
 (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') functions,    -- 279
 (select count(*) from pg_policy pol join pg_class c on c.oid=pol.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public') public_policies,  -- 273
 (select count(*) from pg_indexes where schemaname='public') indexes;                                               -- 523
```

**Verified acceptance manifest (matu-dev, post-Phase-1, 2026-05-30):**
118 BASE TABLEs · 3 views · 6 matviews · 279 functions · 273 public policies (289 incl. storage/cron) · 523 indexes · 85 user triggers · 10 cron jobs · 11 realtime-published tables.

Also snapshot the detail of: storage buckets, `cron.job` rows, `supabase_realtime` publication + replica-identity tables, extension list (use the tables in `docs/plan/live-schema-first-baseline-extraction.md` §Live Manifest as the template).

## Step 1 — Extract public-schema baseline (direct connection)

```bash
pnpm db:baseline:extract:dry-run -- --schemas=public   # inspect plan, no files
pnpm db:baseline:extract -- --schemas=public            # writes .baseline-artifacts/<run>/public.schema.sql
```

ACCEPT ONLY IF: `grep -c 'CREATE TABLE' .baseline-artifacts/<run>/public.schema.sql` == live public `pg_tables` count (118). A lower count = the silent-drop bug → stop, fix the connection, re-extract.

## Step 2 — Local replay check (empty scratch DB)

```bash
pnpm db:baseline:local-check -- --baseline=.baseline-artifacts/<run>/public.schema.sql
```

Must boot clean on an empty Supabase Local scratch project. This is the property the 378-chain lacks.

## Step 3 — Managed surfaces (separate, NOT in the schema dump)

Squash/`pg_dump --schema=public` OMITS these. Recreate explicitly from
`docs/plan/supabase-managed-surfaces-install-bundle.sql` (+ `…-baseline.md`):
extensions, storage buckets + storage policies, auth hook fn + grants + `config.toml` hook, realtime publication + replica identity, `cron.schedule(...)` jobs (10 jobs), Data API exposed-schema check. **Do not** restore `auth`/`storage`/`realtime` as raw dumps.

## Step 4 — Rebuild matu-dev from the baseline

Goal: prove the baseline reconstructs matu-dev. (matu-dev is rebuildable per owner.)
1. Reset matu-dev public schema (or stand up a fresh scratch then point `.env.local` at it). Use MCP/`psql` chunked apply (the pooler drops single long transactions near the grants section — apply in transaction-scoped chunks, per greenfield-baseline Step 4 note).
2. Apply: baseline `public.schema.sql` → managed-surfaces bundle → (Phase-1 cleanup is already folded into the baseline since it was cut from cleaned matu-dev).
3. Reconcile counts against the Step 0 manifest. Any deviation must be explained or owner-approved.

## Step 5 — Regenerate types + validate

```bash
pnpm db:types          # regen from the rebuilt matu-dev
pnpm typecheck && pnpm lint && pnpm build
```

## Step 6 — Migration-folder transition (DECISION REQUIRED)

How `supabase/migrations/` changes once the baseline is proven:
- Write the accepted dump as `supabase/migrations/00000000000000_baseline.sql` (+ managed-surfaces as a companion install step).
- Archive the 378 historical files out of the active chain (e.g. `supabase/migrations/_archive/`) — keep for history, exclude from the replay path.
- Author all future migrations on top of the baseline.

**Decision X vs Y (owner):**
- **X — matu-dev/new-env only:** baseline is the install path for fresh envs; existing prod `iexwsuaqqenyjiskawoj` keeps its applied history untouched. Lowest risk. Recommended.
- **Y — canonical for prod too:** prod's migration history is "repaired" to mark the baseline as already-applied (`supabase migration repair`). Bigger; must not re-run baseline DDL against populated prod.

## Acceptance gates (package not accepted until ALL pass)

- Baseline boots from empty Supabase Local (Step 2).
- `CREATE TABLE` count == 118; public function/policy/index counts reconcile to Step 0 manifest (or owner-approved deviation).
- Managed surfaces (extensions, buckets+policies, auth hook, realtime pub + replica identity, 10 cron jobs) restored + verified as separate steps.
- `pnpm db:types` regenerated; `pnpm typecheck && pnpm lint && pnpm build` green.
- `pnpm lint:db-boundary` passes; greenfield rehearsal SQL stays under `supabase/greenfield/migrations/`.
- SECDEF search_path posture preserved (0 missing — verified clean on matu-dev 2026-05-30).

## Rollback

matu-dev is rebuildable. If a step fails: matu-dev can be re-stood-up from the (still intact) 378-chain applied state it has now, or from the Step 0 manifest + re-apply. **Never** apply baseline DDL to prod. Abort and report on any count mismatch or boot failure.

## Out of scope (separate gates — do NOT bundle here)

- **Production** mutation of any kind.
- **Data migration** (operational rows, provider ids, storage objects, auth users, queues) → `docs/plan/data-audit-classification.md`.
- **POS/payment/stock mutation contract** — unresolved; the baseline must encode whatever the owner decides (does payment completion mutate inventory?). Open blocker.
- **13 dead-RPC candidates** (greenfield P5) — owner-gated T3; decide separately whether the baseline keeps or omits them (external/Flutter clients not visible to monorepo grep).
- **Unused-index pruning** (~231) — needs ≥1 business-cycle prod telemetry first; do NOT bake "dropped" into the baseline based on reset stats.

## References

- `docs/plan/live-schema-first-baseline-extraction.md` — extraction contract + live manifest + acceptance criteria (owner-approved prep).
- `docs/runbooks/supabase-greenfield-baseline.md` — toolchain, safety rails, managed-surfaces steps (the greenfield-project sibling of this runbook).
- `docs/plan/supabase-managed-surfaces-baseline.md` + `…-install-bundle.sql` — managed-surface install SQL.
- `docs/plan/supabase-local-baseline-replay.md` — the replay-failure analysis.
- `tasks/regressions.md` — RPC-DROP-MUST-SCAN-6-CHANNELS, NO-SUPERSEDED-PERMISSIVE-POLICY.
