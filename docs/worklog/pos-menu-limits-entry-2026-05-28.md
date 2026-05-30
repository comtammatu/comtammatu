# POS menu limits entry - 2026-05-28

Surface: `/br/[branchId]/pos`.

Primary user job: cashier or branch manager locks an unavailable dish or sets today's sales cap without leaving the POS flow.

Route family: branch operational routes.

Change type: UI entrypoint and shared client action surface; no schema change.

Primitives: shadcn `Button`, `Sheet`, `Input`, `Switch`, `Badge`, `ScrollArea`, `Tooltip`, `Spinner`.

## T2 self-review

PM: Scope is a POS-accessible "lock dish / daily cap" control backed by the existing branch menu limits contract. Done means cashier/branch manager can open it from POS, update a dish, and POS menu cards continue respecting the limit.

BA: Rules stay unchanged: branch-scoped, per-day, `is_disabled` blocks the item, `limit_quantity` caps portions, `sold_today` is preserved by DB triggers. Waiter must not see the management entrypoint.

Dev: Reuse existing `branch_menu_item_daily_limits` RPC actions and the KDS sheet pattern. Factor the sheet under branch `menu-limits` so POS and KDS use one implementation; do not add a migration or a second ACL layer.

QA: Add static coverage that POS wires the sheet through `canManageMenuLimits` and that the shared sheet uses the canonical branch actions. Run focused app tests plus required repo gates if feasible.
