# POS/KDS Inventory Truth G4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make stock-control sellable portions unit-safe by converting recipe line quantities through `entry_unit_id`, and let managers select the ingredient unit used by each menu recipe line.

**Architecture:** Reuse the existing recipe line `entry_unit_id`, `ingredient_units.to_base_factor`, and `inv_to_base_for_tenant(...)`. Do not add a new sell-unit table or duplicate conversion math in TypeScript.

**Tech Stack:** Supabase SQL migrations, Next.js App Router, TypeScript, node:test static contract tests.

---

## Files

- Create: `supabase/migrations/20260630083000_menu_stock_capacity_multiunit.sql`
- Modify: `apps/web/app/(protected)/inventory/recipes/page.tsx`
- Modify: `apps/web/tests/menu-limits-stock-capacity.test.ts`
- Optionally inspect only: `supabase/migrations/20260630082000_pos_kds_inventory_truth_g3_outcomes.sql`

## Tasks

### Task 1: Stock-capacity compute uses recipe entry units

- [ ] Add assertions in `apps/web/tests/menu-limits-stock-capacity.test.ts` that `compute_menu_item_stock_capacity` calls `inv_to_base_for_tenant(...)`, includes `entry_unit_id`, and divides by the converted per-portion quantity.
- [ ] Run `corepack pnpm --filter @comtammatu/web test -- menu-limits-stock-capacity.test.ts`; expect failure before SQL patch.
- [ ] Patch `compute_menu_item_stock_capacity(...)` so `per_portion_qty` uses `ingredient_units.to_base_factor` when `entry_unit_id` is present, and returns `NULL` for missing conversion.
- [ ] Re-run the targeted test; expect pass.

### Task 2: Recipe UI passes ingredient units

- [ ] Extend the ingredient row cast in `apps/web/app/(protected)/inventory/recipes/page.tsx` to include `units`.
- [ ] Map `units` through to `IngredientOption` so `RecipeLinesEditor` can show the existing unit dropdown.
- [ ] Add static assertions that the page passes `units: i.units`.
- [ ] Re-run the targeted test; expect pass.

### Task 3: Verify and review

- [ ] Run `corepack pnpm --filter @comtammatu/web test -- menu-limits-stock-capacity.test.ts pos-daily-limit-stock-capacity.test.ts`.
- [ ] Run `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm build`.
- [ ] Run `codegraph index .`.
- [ ] Do a T3 written review pass covering PM, BA, Senior Dev, and QA; record any remaining risk in the final response.
