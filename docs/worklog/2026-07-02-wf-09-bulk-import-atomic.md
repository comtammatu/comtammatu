# WF-09 Bulk Import Atomic

Reconciled-through 04f197598db89501c34e62329575f25705ea0faa.

## Skill Plan

Repo rules = `AGENTS.md`, `engineering.md`, `skills.md`, `database.md`, `workflow.md`, `team.md`, `ui.md`; external skills = `supabase`, `supabase-postgres-best-practices`; runtime tools = local git worktree, Supabase MCP SELECT-only on `iexwsuaqqenyjiskawoj`, Supabase CLI migration creation, local test/gate commands; skipped = production writes and `db:types` until the migration is applied to the type-source schema.

## Current-State Verification

- Worktree: `/Users/luongthebinh/Downloads/comtammatu-wf-09-bulk-import-atomic`, branch `codex/wf-09-bulk-import-atomic`, based on local `main` at `04f19759`.
- CodeGraph: original checkout had `.codegraph/` and was refreshed before task lookup; the new worktree has no `.codegraph/`, so source lookup in the worktree uses `rg` and direct reads per `AGENTS.md`.
- Source: `importIngredients` currently resolves/creates units and categories, then calls `upsert_ingredient_catalog` once per row. `importProductionRecipes` currently calls `upsert_production_recipe_lines` once per finished-good group.
- UI callers: `IngredientImportExportMenu` and `ProductionRecipeImportExportMenu` call those actions through `FileImportDialog`; no other UI caller writes these imports.
- Prod metadata SELECT-only: `upsert_ingredient_catalog` and `upsert_production_recipe_lines` exist on production; no batch import RPC exists yet. The applied ledger includes `ingredient_catalog_tenant_scope_hardening` and `persist_entry_unit_in_atomic_rpcs`.

## T3 Debate

PM: WF-09 should only remove partial-write risk from inventory bulk imports. Done means each import action validates the spreadsheet in TypeScript, then performs the database write through one RPC call, with no production apply in this session.

BA: Ingredient import must remain name-based upsert from the operator file, with units/categories created as needed, and BOM import must replace each included finished good's lines. Invalid spreadsheet data stays preflighted in the action; database failures return sanitized Vietnamese errors.

Senior Dev: Add two narrow batch RPCs instead of broad refactors: one for ingredient catalog import rows and one for production recipe groups. Keep existing single-item RPCs for dialogs/manual edits. Do not regenerate generated types because there is no dev/type-source schema with this migration applied.

QA/QC: Static tests must prove the import actions call one batch RPC rather than row/group RPC loops, the forward SQL defines and grants the RPCs, and client errors are sanitized. Full gate required before done: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm lint:baseline && corepack pnpm test && corepack pnpm build`.

## Unified Contract

Implement the smallest root fix: write a forward migration with `bulk_import_ingredients(jsonb)` and `bulk_import_production_recipes(jsonb)`, wire `importIngredients` and `importProductionRecipes` to those RPCs after Zod validation, keep UI unchanged, and add focused static coverage for the atomic import path. Production migration application and `db:types` remain owner/type-source follow-up actions.

## Second-Runtime Attempt And Fallback Review

Claude CLI was available at `/Users/luongthebinh/.local/bin/claude`, but the review-mode invocation returned `401 Invalid authentication credentials`; no independent second-runtime result was produced. Per `docs/agent/rules/team.md` fallback, this written second opinion is self-authored and therefore weaker than a genuinely independent runtime.

Fallback pass/fail: pass with one recorded limitation. The diff keeps spreadsheet validation in the Server Actions, replaces row/group write loops with one RPC call per import, uses sanitized client-facing error mapping, and adds forward SQL plus static contract tests. Limitation: the migration was not applied to a dev/type-source schema in this session, so generated database types and live SQL execution remain owner/type-source follow-up work.

## Test-Plan Attestation

Covered: action wiring avoids the previous per-row/per-group partial-write path (`apps/web/app/(protected)/inventory/ingredient-actions.ts`, `apps/web/app/(protected)/inventory/production-recipe-actions.ts`); migration contract defines the two batch RPCs and browser-role grants (`supabase/migrations/20260702105307_wf09_bulk_import_atomic.sql`); sanitized error handling is guarded by `apps/web/tests/inventory-bulk-import-atomic.test.ts`.

Deferred with reason: database type regeneration and live SQL execution, because the migration has not been applied to the configured type-source schema and production writes are forbidden in this session.

Known out of scope: WF-07/08 count-slip vs stocktake owner decision, WF-10 central-site operator access, WF-11/12 waste/expiry and transfer one-click receive, UI-ROOT-B width, and WF-13/14/15/16 P3 verification slices.

## Verification

- `corepack pnpm --filter @comtammatu/web exec tsx --test tests/inventory-bulk-import-atomic.test.ts`
- `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm lint:baseline && corepack pnpm test && corepack pnpm build`
