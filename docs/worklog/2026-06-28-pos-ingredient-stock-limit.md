# POS sell-limit by recipe định mức (Task 2) — T3 contract

Owner decision: HARD block (cannot place an order that drives a kitchen ingredient
negative) + per-branch on/off toggle + POS shows "còn N phần". Sequencing 1→2→3.

## Reconciled design (4-perspective debate; choices justified, not majority-vote)

### Toggle home — `branch_feature_flags` (NOT a new branches column)
`branch_feature_flags(branch_id, flag_key, enabled, ...)` already exists with the
`is_feature_enabled(branch_id, flag_key)` RPC + `isFeatureEnabledForBranch()`
helper (same infra as `inv_stocktake_redesigned`). New flag_key
`pos_ingredient_stock_block`, default OFF (no row = disabled). Zero schema change
to `branches`; reuses the existing flag-toggle surface.

### Timing/concurrency — approach (B) pending-demand subtraction, NO holds table
`consume_stock_for_order` decrements stock only at `served→completed`. So
un-completed orders carry un-drawn demand that IS already materialized as live
`order_items` rows. Availability is computed directly:

```
available(ingredient) = on_hand_at_kitchen
  − Σ( oi.quantity * r.quantity / r.yield_factor )   -- consume's EXACT formula
    over orders.status NOT IN ('completed','cancelled') AND oi.status <> 'cancelled'
```

- **Why not (A) holds:** the holds table only earns its keep for *pre-submit
  cross-terminal* reservation (not a v1 requirement). Its biggest risk (QA) is
  stale/stuck holds → phantom sold-out → silent lost sales, requiring release
  wiring on cancel/void/reduce/complete/TTL. **(B) has no holds, so cancel/void/
  reduce automatically free demand** (the aggregate reads live order_items) —
  this eliminates QA's #1 revenue-killer risk entirely.
- **Why not (C) consume-at-placement:** rewrites inventory timing (costing,
  stock_movements, refund-restore, period close). Huge blast radius. Rejected.
- **Concurrency correctness:** the gate must `FOR UPDATE` the demanded ingredients'
  `stock_levels` rows (ordered by `ingredient_id`) so two concurrent orders for
  the last portion serialize — the row lock, not the aggregate, is the gate.

### Enforcement mechanism — an ADDITIVE trigger, gated on the flag (prod-safety override)
SeniorDev preferred putting the check inside `create_order`/`append_order_items`
(once per cart). Overridden for **prod safety**: there is no dev DB, so a
`CREATE OR REPLACE` of those ~200-line core order functions risks a typo breaking
ALL ordering on prod with no pre-merge test. Instead: a NEW `AFTER INSERT FOR EACH
ROW` trigger on `order_items` (named to sort AFTER `trg_enforce_branch_menu_daily_limit`
so lock-acquisition order is globally consistent → no ABBA deadlock). It is
additive + droppable + flag-gated (zero impact on flag-OFF branches and trivially
reversible). Per-row re-aggregation is O(n²) per cart but negligible for small HKD
carts. The aggregate over all not-completed order_items includes this order's
inserted-so-far rows, so it rejects at the offending line (P0001
`insufficient_stock_ingredient:<id>` — REUSE the existing string, do not invent a
new one). Honors `comtammatu.skip_quota_enforcement` (so `split_order` net-zero
re-inserts bypass) + only fires when the branch flag is on.

### Display — `get_branch_menu_ingredient_caps_for_pos(branch_id)` (additive RPC)
Per menu item with a recipe: `max_sellable = floor(MIN over ingredients of
(available)/(quantity/yield_factor))`; empty set when flag off. Merged into
`fetchMenuForPos` alongside the daily-limit merge. **Snapshot upper bound, NOT a
reservation:** shared ingredients couple dishes (selling A lowers B's number); the
trigger is the authoritative gate. No `stock_levels` realtime (would storm) —
refresh on the existing post-submit menu revalidation cadence.

### Explosion fidelity (QA DEFECT 1)
Copy `consume_stock_for_order` (L5975-6096) EXACTLY: `qty * recipe.quantity /
yield_factor`, `oi.status <> 'cancelled'`, kitchen location =
`location_kind='kitchen' AND is_active ORDER BY is_default_consumption DESC,
sort_order NULLS LAST, id LIMIT 1`. Do NOT copy `restore_stock_for_order` (uses a
different `recipe_ingredients.quantity_required` model). No unit conversion
(`purchase_to_measure_factor` ignored, like consume). **Main `menu_item_id` only**
— consume ignores side recipes today, so the gate must too (else it is stricter
than reality → false blocks).

## Out of scope / flags
- **Side-recipe consumption gap (pre-existing):** `consume_stock_for_order` never
  draws `order_items.sides` recipes — a real inventory leak independent of Task 2.
  The Task-2 gate matches consume (main-only) for consistency. Fixing consume to
  draw side recipes is a SEPARATE task (owner decision; affects both consume + gate).
- Pre-submit cross-terminal cart reservation (that's approach A; add later if asked).
- Cross-location / multi-kitchen; production/prep sub-recipes; modifiers (no recipes).
- Completion remains a second gate: placement blocks most oversell but a manual
  stock cut between placement and completion can still raise at completion (pre-existing).

## Files (planned)
- Migration (ADDITIVE only): `branch_kitchen_ingredient_availability()` helper,
  the enforce trigger fn + trigger, `get_branch_menu_ingredient_caps_for_pos()`,
  flag_key seed/registry if `branch_feature_flags.flag_key` is constrained.
- TS display: `pos-menu-types.ts` (+`ingredient_cap`), `menu-actions.ts` (merge the
  caps RPC), a sibling `ingredient-cap-draft.ts` (NOT folded into daily-limit-draft —
  QA DEFECT 2: ingredients are many-dishes→one-ingredient), `pos-menu-grid.tsx`
  badge "còn N phần", `pos-desktop-inner.tsx` add-to-cart block.
- TS write: error mapper (`insufficient_stock_ingredient` → VN, non-retryable) in
  `_utils/submit-with-retry.ts` / `_lib/messages.ts` / `_utils/error-codes.ts`.
- Toggle UI: a `<Switch>` on the existing branch feature-flag surface, owner-gated,
  copy warns "chỉ bật khi tồn kho chính xác."

## Status
- [x] Migration WRITTEN (additive): `supabase/migrations/20260628045057_pos_ingredient_stock_block.sql`
      — `branch_kitchen_ingredient_availability()` helper, `enforce_branch_ingredient_stock()`
      trigger (`trg_enforce_ingredient_stock`, sorts after the daily-limit trigger),
      `get_branch_menu_ingredient_caps_for_pos()` RPC. NOT touching create_order/
      append_order_items. **APPLIED TO PROD** (owner-delegated; 3 funcs + trigger
      verified, guard restored byte-for-byte, `pnpm db:types` regenerated).
- [x] TS display + write-error + toggle UI built; full gate green (typecheck+lint+
      build+test, web 245/0). Display merges the caps RPC into `fetchMenuForPos`
      (cast, no type regen needed — no new tables/columns); `ingredient-cap-draft.ts`
      composes with the daily-limit gate; `insufficient_stock_ingredient` → VN
      non-retryable error. Toggle = `<Switch>` on `/br/[branchId]/settings/pos`
      (owner/branch_manager, SETTINGS_BRANCH) upserting `branch_feature_flags`
      `pos_ingredient_stock_block`; default OFF.
- [ ] **Owner: apply migration to prod** (additive + flag-OFF default → zero
      behavioral change until a branch flips the toggle; safe to apply before/after
      the code). Then enable the flag on ONE branch and run the QA gates below.
- [ ] QA gates to run on the first enabled branch: toggle-OFF full bypass
      (regression — existing branches unchanged), last-portion concurrency, shared-
      ingredient coupling, formula parity with consume, recipe-less = sell-free,
      missing-kitchen-location = no block, no deadlock with the daily-limit trigger.
- [ ] Optional later: regen types to drop the RPC cast; fix the pre-existing
      side-recipe consumption gap (separate task).
