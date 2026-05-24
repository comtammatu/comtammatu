# Docs Drift Audit — 2026-05-23

> Scope: read-only docs/code inventory after report that docs are no longer tracking project progress.
> Workflow: documentation-only audit, so the 4-agent debate is skipped per `docs/agent/rules/workflow.md`.
> Workspace note: the worktree was already dirty. This audit intentionally adds a new worklog file only and does not rewrite existing modified docs.
> Cleanup status: same-day cleanup moved historical plans, greenfield rebuild docs, one-off ERP mapping, and superseded task reports into `docs/archive/`; active `docs/plan/` now contains only current decisions and ADRs.
> 2026-05-24 follow-up: database schema source-of-truth was cleaned up. The stale early-2026 table list moved to `docs/archive/ref/database-schema-early-2026.md`; active `docs/spec/database-schema.md` now points to generated types, applied DB state, migrations, and `docs/modules/database.md`.

## Executive Summary

Docs drift is still material. The biggest problem is no longer a single stale module doc; it is that multiple "entrypoint" docs point to different eras of the project.

Current repo evidence from this checkout:

- `apps/web/app` has 109 `page.tsx` routes.
- `packages/database/src/types/database.types.ts` has 115 public tables, 9 public views, and 214 public functions.
- `supabase/migrations` has 337 SQL migration files.
- Tests exist across 32 `*.test.ts` / `*.spec.ts` files under `apps/web/e2e` and `packages/shared/src`.
- Markdown link scan found 30 missing relative links across `docs/` and `tasks/`.

## P0 Drift

### 1. Active docs point to archived or missing plan files

Evidence:

- `docs/agent/rules/references.md` still lists `docs/plan/roadmap.md`, `docs/plan/ui-ux-rebuild.md`, `docs/plan/ui-ux-page-contracts.md`, and `docs/plan/m2-order-lifecycle.md` as active sources.
- `docs/README.md`, `tasks/todo.md`, Inventory references, and POS user guides still link to several `docs/plan/*` files that no longer exist at that path.
- The files exist mostly under `docs/archive/plan/`, but many active docs were not repointed.
- `docs/llm-wiki/README.md` and module cards still tell agents to read `docs/plan/super-app-merchant-platform-rebuild.md` and `docs/plan/merchant-platform-ia-contract.md`; both files are archived now, not active.

Risk:

- Agents and engineers start from broken or historical sources and then make implementation decisions against the wrong plan.
- The documented rule-loading map is not trustworthy for onboarding or task planning.

Fix:

- Update `docs/agent/rules/references.md` first. It is the agent source-of-truth map.
- Repoint active plan references to current docs when still current, or to `docs/archive/plan/*` with explicit "historical reference only" wording.
- Fix or remove stale links in POS user guides and Inventory reference docs.

### 2. Strategy docs conflict with actual current work

Evidence:

- Before cleanup, `docs/plan/system-rebuild/PROGRAM-READINESS.md` locked a greenfield cutover and said in-place work was frozen.
- Before cleanup, `docs/plan/system-rebuild/README.md` was still `Status: PROPOSED` but said the rebuild was approved.
- Current working tree and `tasks/todo.md` show active in-place/pilot work: Viettel S-invoice only, new cron routes, print document migrations, KDS cleanup migration, and updated HĐĐT docs.
- `docs/llm-wiki/README.md` says the current direction is an in-place restaurant operating platform rebuild, while system-rebuild docs still read like a new green baseline program.

Risk:

- A future agent may freeze pilot-critical work or start greenfield planning when the repo is actually moving in-place.
- Product status discussions will keep mixing "blue/green program" with current production hardening.

Fix:

- Owner decision needed: either system-rebuild is still active, or it is historical.
- If historical, archive or demote the greenfield rebuild pack and make `tasks/todo.md` + module docs the active pilot track.
- If active, add an exception register for the current HĐĐT/KDS/print work and update the active tracker to explain why in-place work continues.

### 3. Database snapshots are stale in multiple "fast orientation" docs

Evidence:

- Runtime generated types: 115 public tables, 9 public views, 214 public functions.
- `docs/modules/database.md` says 102 tables, 8 views, 132 functions, and 278+ migrations.
- `docs/llm-wiki/module-cards/database-supabase.md` says 109 tables, 9 views, 198 functions, and 299 migrations.
- Actual migration file count is 337.

Risk:

- Schema risk is underestimated. New DB work may miss current HĐĐT archive/reconcile, KDS cleanup, print documents, or recent auth/payment objects.

Fix:

- Refresh `docs/modules/database.md` and the DB module card from generated types.
- Add a tiny generated snapshot script or CI check so these counts are not hand-maintained.

## P1 Drift

### 4. Route docs partially reflect old route tree

Evidence:

- Runtime route count is 109.
- `docs/modules/web-app.md` says 107 routes.
- `docs/llm-wiki/module-cards/web-app-routes.md` says 114 routes.
- Before cleanup, `docs/modules/web-app.md`, `docs/CODEBASE_MAP.md`, and some Inventory docs said `/admin/inventory/*` page files existed on disk; current `apps/web/app/(protected)/admin` has no `inventory` subdirectory. `route-resolution.ts` says the pages were removed and only the retired ACL mapping remains.
- Current Finance has `/finance/summary`, but some route lists omit it.
- Current Employee has `/employee/permissions` and `/employee/shift-register`, but some route lists omit them.

Risk:

- Route ownership, QA coverage, and ACL review will be scoped incorrectly.

Fix:

- Regenerate route inventory from `find apps/web/app -name page.tsx`.
- Update `docs/modules/web-app.md`, `docs/CODEBASE_MAP.md`, and LLM wiki route card together.
- Replace "page files exist but unreachable" with "URL space maps to retired `inventory_admin`; page files removed" where accurate.
- Cleanup started 2026-05-24: `docs/modules/web-app.md`, `docs/CODEBASE_MAP.md`, and `docs/modules/auth.md` now describe `/admin/inventory/*` as a removed page tree with a retained retired ACL mapping.

### 5. Test coverage statements lag reality

Evidence:

- Current checkout has 9 Playwright specs under `apps/web/e2e` and many shared unit tests, 32 test/spec files total.
- Some docs and older worklog entries still describe 5 E2E specs or no unit/component suite in broad terms.

Risk:

- Reviewers may overstate test gaps or skip existing focused tests.

Fix:

- Update only active orientation docs with current test inventory.
- Keep old worklog audits unchanged as historical snapshots.

### 6. HĐĐT provider cleanup is mostly done, but the file name and plan body still mislead

Evidence:

- Active runtime/docs now say Viettel S-invoice only.
- Before cleanup, `docs/plan/hddt-hybrid-misa.md` was marked historical/superseded but still remained in active `docs/plan/`, and its body still contained active-sounding MISA instructions, including `MisaProvider` and `INVOICE_PROVIDER` switch guidance.

Risk:

- A future agent may reintroduce MISA/provider switching despite `tasks/regressions.md` explicitly banning it.

Fix:

- Rename or move this doc to archive, or split it into:
  - active `docs/plan/hddt-hybrid-sinvoice.md`
  - archived `docs/archive/plan/hddt-hybrid-misa.md`
- Keep only Viettel S-invoice guidance in active paths.

### 7. `tasks/todo.md` mixes active tracker, historical branch notes, and missing links

Evidence:

- Header says shipped history lives at missing `docs/plan/roadmap.md`.
- Several item descriptions still keep old "WAITING apply / TS edit" language even where later docs suggest work has moved.
- The file also contains live 2026-05-23 HĐĐT status, which is useful and should be preserved.

Risk:

- Engineers cannot tell whether a line is current, historical, or already superseded by later work.

Fix:

- Keep `tasks/todo.md` as active-only.
- Move historical branch notes to `docs/archive/plan/` or a worklog note.
- Use consistent status labels from `docs/modules/database.md`: `drafted`, `applied to dev`, `types generated`, `UI wired`, `prod-applied`.

## P2 Drift

### 8. Markdown link hygiene needs a cleanup pass

Evidence:

- Link scan found 30 missing relative links.
- Some are true broken active links, especially moved `docs/plan/*` files.
- Some are historical archive links or repo-root links from `tasks/` that the simple checker cannot resolve correctly.

Fix:

- Fix active broken links first.
- Add a markdown link check that understands repo-root links and ignores `docs/archive/**` unless explicitly requested.

### 9. Archive docs still self-reference old active paths

Evidence:

- Archived plan docs still point to old `docs/plan/*` paths inside their own text.

Risk:

- Lower than active docs, but confusing during archaeology.

Fix:

- Add a standard archive banner saying internal links may refer to pre-archive paths.
- Do not spend time fixing every archived cross-link unless the doc is promoted back to active.

## Recommended Cleanup Order

1. **Fix entrypoint map first**: `docs/agent/rules/references.md`, `docs/README.md`, `docs/llm-wiki/README.md`.
2. **Resolve strategy authority**: decide whether the greenfield rebuild pack is active or historical.
3. **Refresh generated snapshots**: route count/tree, DB count, migration count, test inventory.
4. **Normalize active tracker**: clean `tasks/todo.md` links and stale historical branch notes without deleting useful 2026-05-23 HĐĐT/KDS/print status.
5. **Provider docs split**: move/rename the MISA historical plan so active paths cannot be mistaken as MISA guidance.
6. **Add drift tooling**: lightweight script for route count, DB object count, migration count, and markdown links.

## Suggested Acceptance Criteria For The Cleanup PR

- No active doc points to a non-existent `docs/plan/*` file.
- `docs/agent/rules/references.md` names only current source-of-truth docs.
- Route count and DB counts match the current checkout or are explicitly marked as generated snapshots with a date.
- Active HĐĐT docs mention Viettel S-invoice only; MISA appears only in historical/archive context.
- `tasks/todo.md` can be read as active work only.
- `docs/archive/**` is clearly historical and no longer treated as implementation guidance.
