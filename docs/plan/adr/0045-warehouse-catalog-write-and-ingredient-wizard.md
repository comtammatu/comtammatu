# ADR 0045 — Warehouse catalog write authority and ingredient unit wizard

**Status:** Accepted

**Decision owner:** Owner

Runtime catalog RPC: `save_ingredient_catalog`. This ADR owns write
authority and the 20-unit cap.

## Decision

1. Permission `inventory:catalog_write` (module `inventory`, tenant scope, not
   staff-delegable). Seed `tenant_owner`.
2. `save_ingredient_catalog` authorizes
   `has_permission_any('inventory:catalog_write') OR
   has_position('central_supply_ops')` — not hardcoded owner. Position adapter
   covers the D076 JWT-role bridge until ADR 0015; capability is the durable
   path.
3. Restore the 20-unit cap.
4. Owner-plane create/edit uses a 3-step `IngredientWizard` (`FormDialog`);
   one atomic RPC remains the only catalog write. Role-unit columns stay
   hardcoded to base in UI (YAGNI).

`central_kitchen_lead` stays read-only. Deletion behavior is unchanged.
