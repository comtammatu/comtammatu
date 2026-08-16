# ADR 0026 — POS stock posting is post-and-flag; pre-order hard-block with BM override

**Status:** Accepted (Owner 2026-08-10; pre-order hybrid, BM override 1C/2A,
per-menu-item grain, and add-N-on-top allowance semantics locked same day).

**Decision owner:** Owner

**Review tier:** T3 — money path, stock ledger correctness, multi-row RPC

**Reverses the `no negative stock` clause of D065** at posting time and retires
the silent-skip behavior of `post_pos_sale_consumption_if_ready`. The D065
pre-order hard-block for cashiers/floor staff is **kept**; only Branch Manager
may reopen the sell path for an exhausted **menu item** via a dedicated daily
sellable-allowance field on the menu-limits plane — **per menu item**, not per
ingredient (not warehouse replenish).

## Context

`post_pos_sale_consumption_if_ready` is all-or-nothing: the first short
ingredient returns `insufficient_stock_at_posting`, so a paid order may post
zero movements. A missing `stock_levels` row reads as on-hand `0`. On the
success path `INSERT … SELECT FROM stock_levels` silently drops ingredients
without a row while still returning `consumed: true`, and
`COALESCE(sl.avg_unit_cost, 0)` books zero food cost when WAC is unknown. The
alert kind `pos.payment_stock_failed` has no emitter left.

Má Tư portions are average recipes with real variance — not packaged SKUs. That
justifies post-and-flag after payment; the owner rejected a purely advisory
pre-order gate for cashiers/floor. Silent skip is not an option: it loses the
movement, loses the cost, and reports success.

## Decision

### 1. Post every line, then flag

When a paid or completed order needs deduction and on-hand is short, or the
`stock_levels` row is missing: still deduct (allow negative; create missing
row); still book food cost (never zero silently); still record a durable
follow-up. Posting is **per ingredient** — one short line never suppresses
others.

### 2. Pre-order: hard-block by default; Branch Manager may override

`enforce_branch_stock_availability` keeps the hard block on `order_items`
insertion for cashiers and floor staff. Branch Manager may reopen the sell path
by re-enabling the item and/or entering a **supplemental sellable allowance**
(`Giới hạn bán`) that the gate and availability RPCs honor. Grain is **per menu
item**. Semantics: the value **adds N portions on top of** stock-derived
remaining — not an absolute daily sellable count, and not an “ignore stock”
flag. The override only continues the sell path; it does not skip posting, mute
food cost, touch the warehouse ledger, or replace post-and-flag.

### 3. Reuse menu-limits — dedicated allowance; no ledger falsification

Reuse `/br/[branchId]/menu-limits` (`branch_menu_limits`, D064,
`branch_menu_limit_availability`). Locked (Owner 2026-08-10):

- **1C:** dedicated daily field `stock_allowance_quantity` (nullable integer,
  `CHECK >= 0`) on `branch_menu_item_daily_limits` — per menu item, not per
  ingredient.
- **1B rejected:** the former `add_menu_item_stock_exception` /
  `Bổ sung tồn kho` (+1/+2 ledger replenish) path is retired and must not
  return — it booked warehouse movements; override is allowance-only.
- **2A:** override UI is the shared menu-limits drawer (home trigger, `/menu-limits`, and POS header for owner/branch_manager); allowance is a switch in UI (RPC stays integer); no POS manager PIN.

### 4. Cost fallback ladder

Book the first available value and record the rung: (1) location
`avg_unit_cost`; (2) same-ingredient WAC elsewhere in the tenant; (3) latest
settled purchase unit cost; (4) last-known `stock_movements.unit_cost`
(`production_output` first); (5) zero — only with a follow-up flag. Empty or
negative on-hand keeps the last positive location WAC.

### 5. Honest result contract

`consumed: true` only when every recipe line posted a movement. Rejected:
blocking completed-order posting on shortfall; all-or-nothing posting; silent
skip; advisory pre-order for cashiers/floor; POS-only force-sell outside
menu-limits; stock-exception replenish as BM override; POS PIN at hard-block.

## Consequences

- Negative on-hand is legitimate on the posting path.
- D065 loses only no-negative-at-posting; pre-order hard-block remains.
- Replace dead `pos.payment_stock_failed` with a branch-reachable follow-up.
- Parked (INV-13): `stock_movements` partition/retention.
- Implementation pointers live in `tasks/todo.md`.

## Verification

- Short ingredient: all recipe lines post; result names the short one.
- Missing `stock_levels` row: movement + row created.
- No `consumed: true` while any line was skipped; shortfall never rolls back
  payment.
- Cashier/floor stock-exhausted insert fails until BM override on menu-limits;
  after override, posting still deducts/flags when short and creates no
  warehouse movements.
