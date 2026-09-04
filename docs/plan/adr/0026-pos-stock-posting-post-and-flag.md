# ADR 0026 — POS stock posting is post-and-flag; pre-order hard-block with BM override

**Status:** Accepted (Owner 2026-08-10)

**Decision owner:** Owner

**Reverses the `no negative stock` clause of D065** at posting time and
retires silent-skip in `post_pos_sale_consumption_if_ready`. The D065
pre-order hard-block for cashiers/floor staff is **kept**.

Runtime POS consumption: [`docs/ref/inventory.md`](../../ref/inventory.md)
§3–§4. Cost first rung: ADR 0040 company WAC.

## Decision

### 1. Post every line, then flag

When a paid or completed order needs deduction and on-hand is short, or the
`stock_levels` row is missing: still deduct (allow negative; create missing
row); still book food cost (never zero silently); still record a durable
follow-up. Posting is **per ingredient** — one short line never suppresses
others.

### 2. Pre-order: hard-block by default; Branch Manager or Owner may override

`enforce_branch_stock_availability` keeps the hard block on `order_items`
insertion for cashiers and floor staff. Branch Manager or Owner may reopen
the sell path by re-enabling the item and/or entering a **supplemental
sellable allowance** (`Giới hạn bán`) that the gate honors. Grain is **per
menu item**. The value **adds N portions on top of** stock-derived remaining —
not an absolute daily sellable count, and not an “ignore stock” flag. The
override does not skip posting, mute food cost, or book warehouse
replenishment.

### 3. Reuse menu-limits — dedicated allowance; no ledger falsification

Reuse `/br/[branchId]/menu-limits` (`stock_allowance_quantity` on
`branch_menu_item_daily_limits`). The former `Bổ sung tồn kho` ledger
replenish path must not return. Override UI is the shared menu-limits drawer;
no POS manager PIN.

### 4. Cost fallback ladder

Book the first available value and record the rung: (1) **company WAC**
for the SKU (ADR 0040; `stock_levels.avg_unit_cost` is that number on every
site); (2) last-known `stock_movements.unit_cost` (`production_output`
first); (3) zero — only with a follow-up flag. Empty or negative on-hand
keeps the last positive company WAC.

### 5. Honest result contract

`consumed: true` only when every recipe line posted a movement. Rejected:
blocking completed-order posting on shortfall; all-or-nothing posting; silent
skip; advisory pre-order for cashiers/floor; POS-only force-sell outside
menu-limits; stock-exception replenish as BM override.

## Consequences

Negative on-hand is legitimate on the posting path. D065 loses only
no-negative-at-posting; pre-order hard-block remains.

## Verification

- Short ingredient: all recipe lines post; result names the short one.
- Missing `stock_levels` row: movement + row created.
- No `consumed: true` while any line was skipped; shortfall never rolls back
  payment.
- Cashier/floor stock-exhausted insert fails until BM override on menu-limits;
  after override, posting still deducts/flags and creates no warehouse
  movements.
