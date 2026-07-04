# T3 Inventory Unit RPC Contract - 2026-07-05

> Reconciled-through f6d6d793

## Scope

Remove Inventory RPC dependence on client-supplied unit text while keeping existing RPC signatures replay-safe for deployed callers.

## Debate

- PM: Unit catalog is already the product source of truth. Forms may still send legacy `unit` for compatibility, but saved Inventory rows must derive it from `entry_unit_id` and ingredient unit configuration.
- BA: If `entry_unit_id` is missing, the valid default is the ingredient base unit, not an arbitrary client fallback. Invalid or inactive ingredient/unit pairs must fail loudly.
- Senior Dev: Add one tenant-explicit SQL helper that maps `ingredient_units.unit_id` to `units.code`, then replace affected RPC bodies. Keep `create_expiry_writeoff(p_unit text, ...)` signature because generated types and old callers may still pass it, but ignore `p_unit` for persistence.
- QA: Static tests must assert RPCs no longer validate/insert client `unit` text and that helper uses `unit_id`, not `ingredient_units.id`.

## Decision

Implement a new migration plus baseline mirror for the helper and affected RPC bodies. Do not apply the migration directly to production.
