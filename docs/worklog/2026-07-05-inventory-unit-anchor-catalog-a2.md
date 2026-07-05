# Inventory Unit System — Phase A2 (anchor-aware ingredient catalog)

> Reconciled-through a5032545c2752b9b10de1199df7a4623fe064eb0

Plan: `docs/plan/inventory-unit-system-2026-07-03.md` §5 (Catalog) / §6 (Phase A).
Phase A (columns + `inv_derive_to_base_factor` + standard seed) is already applied
to prod (ledger `20260703150555`). This slice wires the ingredient catalog form and
RPC to the anchor model so owners enter adjacent conversions instead of a flat
factor-to-base.

## Problem

Today every non-base unit stores `to_base_factor` as a direct ratio to the single
base unit (star topology). For Mật ong with base = ml, the owner must type
`1 Thùng = 6000 ml` — a number nobody knows. People know the adjacent steps:
`1 Chai = 250 ml`, `1 Thùng = 24 Chai`.

## Review tier: T3

Triggers: modifies a multi-row-writing catalog RPC; `to_base_factor` is the input
to 11 inventory/finance posting RPCs, so a wrong conversion silently corrupts stock
value and COGS.

### PM — scope / acceptance / priority
- Scope: anchor entry in the ingredient dialog + server-authoritative derivation in
  `upsert_ingredient_catalog`. NOT in scope: dropping `allow_*` (Phase C), the 11
  posting RPCs (already contract-updated), the standalone units master screen.
- Acceptance: owner adds Mật ong with base ml, Chai anchored to ml (250), Thùng
  anchored to Chai (24); saves; reopens and sees the same adjacent factors; stored
  `to_base_factor` = 250 and 6000. Cross-dimension / cyclic anchors are rejected.
- Priority: unblocks correct multi-unit catalog entry before owner's opening-stock
  count (plan Phase B is gated on it).

### BA — rules / edge cases / data flow
- Exactly one base unit; base `to_base_factor = 1`, no anchor.
- Standard unit (kg/g/ml/l) row: no anchor; ratio is `standard_factor/base.standard_factor`,
  valid only when base is a standard unit of the same dimension.
- Packaging unit row: anchors to any other unit on the same ingredient; chain is
  walked to the base or to a standard unit, multiplying factors. Fail-closed on a
  missing anchor, a cycle, or a cross-dimension hop.
- Backward compatibility: a non-base packaging row with NO anchor falls back to the
  client-sent `to_base_factor` (legacy flat entry) so the RPC keeps working for the
  currently-deployed dialog during the apply→deploy window.
- Data flow: dialog → `deriveToBaseFactor` (TS mirror, preview only) → action sends
  `{unit_id, is_base, anchor_unit_id, anchor_factor, to_base_factor, allow_*}` →
  RPC re-derives authoritatively via `inv_derive_to_base_factor` → persists
  `to_base_factor` + `anchor_unit_id` + `anchor_factor`.

### Senior Dev — approach / files / risk / blast radius
- DB `20260706170000_..._phase_a2_catalog_anchor.sql`: `CREATE OR REPLACE
  upsert_ingredient_catalog` (signature unchanged). New private helper
  `inv_catalog_unit_to_base(base_unit_id, unit_elem, all_units)` centralizes the
  derive-or-legacy-fallback rule, reused for the persisted factor and the legacy
  `purchase_to_measure_factor`.
- App: `_lib/types.ts` (+anchor on `IngredientUnitRow`, +dimension/is_standard/
  standard_factor on `UnitOption`); `ingredient-actions.ts` (schema + buildRpcUnits +
  fetchIngredients select + fetchUnitOptions); `ingredients/ingredient-dialog.tsx`
  (anchor UI + live preview); `lib/messages/inventory-master.ts` (copy).
- Signature unchanged + anchor columns already in generated types ⇒ NO `db:types`.
- Risk: derivation drift between SQL and the TS preview mirror — both already exist
  and are asserted in sync; this slice only calls them. Legacy `purchase_to_measure_
  factor` value is unchanged because the derived secondary factor equals what the old
  client computed.
- Blast radius: `upsert_ingredient_catalog` callers = ingredient dialog (updated) +
  `quickCreateIngredient` (base-only, unaffected). Bulk import uses a different RPC.

### QA — tests / regressions to recheck
- Static: assert the migration calls `inv_derive_to_base_factor` and persists
  `anchor_unit_id`/`anchor_factor`.
- Cross-boundary (DB ↔ action ↔ type ↔ form): anchor field names match across the
  jsonb payload, the Zod schema, `IngredientUnitRow`, and the dialog form row.
- Reuse `inventory-unit-derivation.test.ts` for the chain math (already covers
  bao→kg→g and cycle/dimension failures).
- Recheck: existing single-unit ingredients still save (base-only path); GRN/issue/
  count option builders read `to_base_factor` unchanged.

## T3 review outcome (independent code-reviewer lane)

- **HIGH (fixed).** The first resolver draft force-derived every standard-unit
  row even without an anchor, so an ingredient with a **packaging base + a
  standard secondary** (e.g. base=chai, secondary=ml — what the old flat dialog
  and the legacy bulk-import template produce) hit `standard_unit_dimension_
  mismatch` and became unsavable, contradicting the header's own backward-compat
  promise. Fix: `inv_catalog_unit_to_base` now derives ONLY anchored rows; every
  anchorless row (standard, packaging, legacy) keeps its client `to_base_factor`.
  Server authority stays exactly where the tamper surface is — anchored chains.
  Side effect: the helper no longer reads `units` at all, which also resolves the
  review's MEDIUM about a missing `is_active` filter in the helper.
- Added executable coverage in `inventory-unit-derivation.test.ts`: the owner's
  flagship ml-base chain (Thùng=6000, Chai=250) and the packaging-base/standard-
  secondary rejection that documents why the RPC keeps the client factor.

## Intended model + residual (owner note)

- Intended shape: **base = the standard/smallest divisible unit** (ml, g, kg…),
  packaging units anchor up to it (honey: base ml; chai→ml=250; thùng→chai=24;
  rice: base kg; bao→kg=25). The new dialog guides toward this (standard rows
  auto-derive; packaging rows take an anchor + factor).
- Residual, non-blocking: an existing ingredient stored with a **packaging base
  and a standard secondary** still SAVES unchanged (RPC keeps its client factor),
  but the new dialog cannot re-derive that shape, so editing it shows the
  "không quy đổi được" preview until the owner re-bases it to a standard base.
  Recommend confirming prod has few/no such rows (stock is empty during the
  catalog rebuild) and re-basing them; not required to ship this slice.

## Baseline

Not hand-mirrored into `00000000000000_baseline.sql`. That baseline is an
owner-gated `pg_dump` of prod (see `supabase/migrations/README.md`); this forward
migration `CREATE OR REPLACE`s the RPC on top of it in the chain, so a from-empty
bringup (baseline + forward chain) gets A2. `db:baseline:local-check` only gates a
clean replay of the baseline itself, which is unaffected.

## Pre-existing `main` failures (NOT this PR)

Observed while running the full gate on origin/main (tip 47e12877c), both from the
owner's recent commits, unrelated to A2 — flagged as separate tasks:
- `lint:ui-contract`: `grn/grn-list-client.tsx` — 2 operator-plane office-density
  buttons (PR #274 GRN button work).
- `test`: `security-definer-rpc-static` — `20260706150000_bill_line_items_merge_
  notes.sql` grants `bill_line_items` to a browser role with no auth-boundary /
  allowlist entry.

## Verification
- Gates run fresh in the worktree (turbo cache distrusted). `typecheck` green;
  `lint:ui-contract` clean for A2 files (only the pre-existing grn hit remains);
  `lint:i18n:no-grow` OK (11 ≤ 11); A2 + derivation tests green.
- Migration is file→PR→owner-applies; additive + backward-compatible (anchorless
  rows unchanged) so it may be applied before the code deploy without breaking the
  live dialog. Phase A is already in prod (ledger `20260703150555`).
