# New Project Upgrade Baseline

> Status: PREP ONLY
> Started: 2026-05-26
> Current source commit: `b020d1b0`

This file is the active baseline package for cleanup before a future upgraded
project. It does not re-activate the suspended greenfield cutover program by
itself.

## Decision Boundary

The current repo remains the active pilot/hardening source. Cleanup for the
upgraded project can proceed as packaging work only until owner explicitly
chooses one target:

| Option                    | Meaning                                                                                                                   | Current default        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Same-stack green baseline | New Supabase project/database, existing Next.js App Router/PWA/print-agent runtime, cleaner schema baseline               | Preferred prep path    |
| Platform fork             | Separate workspace/repo, Cloudflare Worker API, Flutter app, PostgreSQL 18 or another separately approved database target | Deferred               |
| Continue in-place only    | No new baseline; keep hardening current `comtammatu`                                                                      | Still active for pilot |

Do not mix these options inside production code. The cleanup package may read
historical plan evidence, but it must not apply retired freeze/cutover
instructions unless owner reactivates that program.

## Current Snapshot

Generated with `node scripts/project-snapshot.mjs` on 2026-05-26:

| Area                              | Count |
| --------------------------------- | ----: |
| Worktree status entries           |     0 |
| `apps/web/app/**/page.tsx` routes |   109 |
| API route handlers                |    13 |
| Total route handlers              |    15 |
| Generated DB tables               |   116 |
| Generated DB views                |     9 |
| Generated DB functions            |   241 |
| Generated DB enums                |     0 |
| SQL migration files               |   363 |
| Test/spec files                   |    40 |
| Playwright specs                  |     9 |
| Shared unit tests                 |    31 |

## Baseline Rules

- Use the current repo as a verified contract source, not as a folder to copy
  wholesale into a new architecture.
- Active source must not carry unclassified retired-runtime, deprecated, or
  dead-code markers. `pnpm lint:baseline` enforces this for `apps`, `packages`,
  and `scripts`; the only classified source file today is the UI-freeze guard
  script because it protects the current maintenance contract wording.
- Do not replay all historical migrations as the upgraded project's normal
  install path. Produce a clean baseline from verified schema and then add
  forward migrations.
- Do not drop tax, payment, finance, payroll, audit, storage evidence, auth, or
  provider identifier data without audit plus owner sign-off.
- Keep PWA-first / native-later sequencing unless pilot evidence proves PWA is
  insufficient.
- Treat `apps/web/proxy.ts`,
  `packages/shared/src/auth/route-resolution.ts`,
  `packages/shared/src/auth/module-acl.ts`, `scope.ts`, generated DB types, and
  `tasks/regressions.md` as baseline anchors.
- Route/module/ACL inventory is anchored by `docs/CODEBASE_MAP.md`,
  `packages/shared/src/auth/route-resolution.ts`, and
  `packages/shared/src/auth/module-acl.ts`.
- Data-audit classification lives in
  `docs/plan/data-audit-classification.md`. It is source-only today; live row
  counts, storage manifests, prod apply proof, and provider smoke are still
  blockers before any greenfield data cutover.
- Live migration drift reconciliation is summarized in
  `docs/plan/live-schema-first-baseline-extraction.md`. It blocked
  replay-based schema packaging: live had 393 applied migration rows, local had
  363 files / 362 unique versions, and one duplicate local version.
- Owner chose `live-schema-first` after the drift reconciliation. The extraction
  contract and live manifest live in
  `docs/plan/live-schema-first-baseline-extraction.md`.
- Repo-owned baseline wrappers now live in `package.json`:
  `db:baseline:extract:dry-run`, `db:baseline:extract`, and
  `db:baseline:local-check`. The operating runbook is
  `docs/runbooks/supabase-greenfield-baseline.md`.
- Public schema extraction and scratch Supabase Local restore now pass for
  `.baseline-artifacts/supabase-live-baseline-20260526T152439Z/public.schema.sql`.
  This is a public-schema boot proof, not full managed baseline acceptance.
- Managed Supabase surface inventory lives in
  `docs/plan/supabase-managed-surfaces-baseline.md`. It enumerates extensions,
  storage buckets/policies, DB cron, realtime publication/replica identity, auth
  hook/config, and Data API grant caveats. It is not yet an install bundle.
- Managed Supabase install SQL now lives in
  `docs/plan/supabase-managed-surfaces-install-bundle.sql`. On greenfield target
  `staging` / `jmasiwuqiyedqvyfzhuq`, extensions, bucket config, public schema,
  storage policies, realtime publication tables, cron jobs, and auth hook grants
  have been restored and verified.
- Greenfield-only schema hardening and PBAC cleanup SQL now lives in
  `supabase/greenfield/migrations/`, not in `supabase/migrations/`. The
  production-forward chain stays reserved for production-reviewed migrations;
  `pnpm lint:db-boundary` blocks greenfield rehearsal SQL from drifting back
  into that chain.
- Supabase Local empty-database replay evidence lives in
  `docs/plan/supabase-local-baseline-replay.md`. It closes
  `local-chain-first` as `NO-GO`: local migration `20260508055046` references
  `order_items.vat_rate`, which local migration `20260509000000` creates later.
- Never apply migrations directly to production as part of this prep track.

## Comtammatu + Matu Platform Architecture Blend

The upgraded baseline should combine the operationally proven parts of both
codebases. It must not copy either tree wholesale.

| Source          | Adopt into the baseline                                                                                                                                                                                                                                   | Reject as baseline authority                                                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `comtammatu`    | Next.js App Router PWA, `proxy.ts` auth perimeter, Supabase RLS/RPC, print-agent path, single-tenant L0/L1 hierarchy, current POS/KDS/Finance/HDDT provider contracts, verified route/module ACL anchors                                                  | Retired cutover instructions unless owner reactivates that program; broad UI rebuild on top of current frozen visual contract      |
| `matu-platform` | Permission model separation: identity, position, permission, and scope; operator job-focused surfaces; ledger-first inventory with requisition vs transfer separation; provider fail-closed discipline; branch/device identity as explicit registry state | Paused `apps/mobile-native` as product source; old phone app route/state/UI assumptions; direct copy of experimental folders without proving runtime contract |

### Architecture Decisions Carried Forward

- Auth: keep the `comtammatu` Supabase/JWT/proxy stack, but move the target
  model toward the `matu-platform` separation of identity, position,
  permission, and scope. Position labels do not grant permissions.
- Inventory: target ledger-based inventory. Requisitions request movement;
  approved transfers mutate stock. Kitchen/storage wording may be simplified for
  operators, while backend location kind stays explicit where RLS/reporting
  depends on it.
- POS/KDS: keep the current PWA hot path for pilot operations. Native mobile is
  evidence-driven and post-PWA, not part of this baseline unless pilot hardware
  limits prove it.
- Providers: keep Viettel S-Invoice, MoMo native QR, and VietQR flows
  fail-closed. No mock/fallback provider may change the real production UX.
- Surfaces: use job-focused operator screens. Do not rebuild the project into a
  dashboard mosaic or generic enterprise admin shell.

### Open Architecture Conflict

`matu-platform` treats POS/KDS served/payment events as not mutating real
inventory, while current `comtammatu` payment completion includes stock
consumption on the hot path. This must be resolved explicitly before producing a
new database baseline. Until then, do not silently import either behavior as the
upgraded contract.

## Open Blockers Before A Real Upgrade Cutover

| Blocker                                                             | Why it matters                                                                                                                                | Source                                                 |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Production apply status for payment/hardening migrations not proven | Generated types show the shapes, but prod runtime may differ                                                                                  | `tasks/todo.md`                                        |
| Live POS -> payment -> stock -> KDS/print -> HDDT smoke not run     | Static tests do not prove provider and branch-device behavior                                                                                 | `docs/worklog/pilot-hardening-readiness-2026-05-24.md` |
| Full live data audit not complete                                   | Dry-run counts exist, but storage object manifests, prod apply proof, provider identifiers, and final queue decisions still need verification | `docs/plan/data-audit-classification.md`               |
| Linked export must run sequentially                                 | Parallel linked `db dump` attempts can trip Supabase temp-login auth circuit breaker                                                          | `docs/runbooks/supabase-greenfield-baseline.md`        |
| Local migration chain cannot replay from empty DB                   | Supabase Local fails at `20260508055046_hddt_summary_rpcs.sql` before reaching duplicate-version handling                                     | `docs/plan/supabase-local-baseline-replay.md`          |
| Migration history drift prevents replay-based install               | Live `comtammatu` has 393 applied migrations; local has 363 files / 362 unique versions; exact-version match is only 308                      | `docs/plan/live-schema-first-baseline-extraction.md`   |
| Native app remains post-pilot evidence decision                     | No `apps/mobile`; current deployable POS/KDS path is PWA                                                                                      | `tasks/todo.md`                                        |

## Cleanup Queue

1. Refresh active snapshot docs from current checkout.
2. Create this baseline package with commit, counts, options, and blockers.
3. Add active-source baseline hygiene guard and remove obvious deprecated
   runtime exports/comments from the checked source.
4. Inventory stale active docs that still point to archived plans as live work.
5. Produce source-only data-audit classification for tables, storage buckets,
   external IDs, cron jobs, and provider settings.
6. Run the live data audit: row counts, sizes, last writes, storage manifests,
   provider IDs, prod apply proof, and queue-state decisions.
7. Reconcile live migration history versus local migration files. Owner chose
   `live-schema-first`; public schema now boots in Supabase Local and in the
   approved `staging` greenfield target, and managed Supabase surfaces have been
   restored through the install bundle.
8. Standardize schema export and local restore rehearsal commands.
9. Produce route/module/ACL inventory for the upgraded project contract.
10. Resolve the POS inventory mutation contract before creating a clean schema
    baseline.
11. Decide same-stack green baseline vs platform fork before creating a new
    workspace or database.
