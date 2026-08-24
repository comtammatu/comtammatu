# ADR 0045 — Warehouse catalog write authority and ingredient unit wizard

**Status:** Accepted

**Decision owner:** Owner, 2026-08-24 (chat confirmation of the combined
permission + wizard slice)

**Review tier:** T3 — authorization, `SECURITY DEFINER` RPC, migration

**Amends:** nothing supersedes; relaxes the owner-only gate on
`save_ingredient_catalog` introduced with the ingredient catalog RPC.

**Keeps:** `save_ingredient_catalog` as the single atomic catalog RPC
(INGREDIENT-CATALOG-SAVE-ATOMIC-RPC); unit rebase-on-base-change
(INGREDIENT-CATALOG-UNIT-REBASE-NOT-LOCK); anchor-graph contract
(ADR-unit-ladder guards); `central_kitchen_lead` read-only.

## Context

Warehouse operation (warehouse keeper, position `central_supply_ops`) cannot add
or adjust ingredients: catalog writes are hard-gated to the owner role,
and the single mega-dialog forces a two-screen, anchor-graph mental
model with errors surfacing only on submit. Two independent frictions,
one accepted slice.

Separately, `20260820030125` recreated `save_ingredient_catalog` from a
stale copy and regressed the per-ingredient unit cap from 20 back to 3
(raised by `20260803105716`).

## Decision

1. **New permission `inventory:catalog_write`** (module `inventory`,
   tenant scope, not delegable to staff yet). Seeded in
   `permission_keys` and granted to `tenant_owner` via
   `auth_access_role_capabilities`.
2. **RPC gate becomes capability-based**: `save_ingredient_catalog`
   authorizes `has_permission_any('inventory:catalog_write') OR
   has_position('central_supply_ops')` instead of the hardcoded owner
   role. Position adapter covers the D076 JWT-role bridge until
   ADR 0015 role bindings; capability alone stays the durable path.
3. **Restore the 20-unit cap** lost in the `20260820030125` recreation.
4. **UI replaces `IngredientDialog` with a 3-step `IngredientWizard`**
   (Owner-plane `FormDialog`, freely jumpable steps) for both create
   and edit:
   - Step 1 general fields; step 2 standard unit (with rescale warning
     when movements exist); step 3 conversion units.
   - Step 3 rows default to `1 [unit] = N [standard unit]` (implicit
     anchor to base); an explicit per-row advanced toggle keeps the
     anchor chain for multi-hop cases.
   - Inline packaging-unit creation (`+ Đơn vị mới`) inside steps 2/3;
     standard metric units stay seeded-only.
   - Each conversion row types in either direction: `1 [unit] = N
     [anchor]` or `1 [anchor] = N [unit]` (per-row toggle). Inverse
     input stores the reciprocal `anchor_factor`; stored factors below 1
     render inverse on load so editors read `1 pack = 100 pieces`, never
     `1 piece = 0.01 pack`. Counts without an exact reciprocal fail with
     a swap-direction message.
   - Live inline validation and `≈ N [base]` hints; no submit-time-only
     errors.
5. Role-unit columns (`receipt/issue/production_unit_id`) stay
   hardcoded to base in the UI; capability rows exist but remain
   unexposed (YAGNI, later slice).

## Consequences

- `central_supply_ops` manages the catalog without owner escalation;
  deletion behavior and `central_kitchen_lead` access are unchanged.
- One RPC remains the only catalog write path; payload Zod contract is
  unchanged.
- Rollback: revert the migration (restores owner-only gate and cap 3)
  and swap `IngredientWizard` back to `IngredientDialog`.

## Verification

- pgTAP: `central_supply_ops` position saves the catalog; an
  unauthorized role receives `forbidden`; cap-20 payload passes.
- Static gates: permission key parity TS ↔ SQL seed; wizard calls the
  atomic RPC only; role list includes `central_supply_ops`.
- `corepack pnpm lint:seed-permissions` and full verify before commit.
