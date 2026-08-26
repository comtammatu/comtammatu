# ADR 0047 — Recipe Primary Ingredients and Sellable Stock Capacity

**Status:** Accepted (Owner 2026-08-27; multi-primary ingredient selection, sellable capacity gating on primary lines, ADR 0026 post-and-flag full recipe consumption preserved).

**Decision owner:** Owner

**Review tier:** T3 — stock availability, pre-order gating, recipe BOM, food cost accounting

**Extends and refines ADR 0026** by distinguishing primary ingredients from secondary garnishes/condiments in menu recipes (`public.recipes.is_primary`).

## Context

Under ADR 0026 and earlier schema, every recipe line in `public.recipes` was treated equally with `FLOOR(MIN(on_hand / per_portion_qty))`. If a minor garnish or condiment (e.g. cucumber, tomato, fish sauce, pickles) ran out of stock or had an on-hand level of 0, the entire main dish (e.g. Broken Rice with Pork Chop) was immediately marked as out-of-stock (`available_to_sell = 0`) and blocked from cashier ordering (`enforce_branch_stock_availability`).

In actual F&B operations, running low on garnish vegetables does not prevent serving main dishes. However, running out of main proteins or staple ingredients (e.g. Pork Chop, Ribs, Broken Rice grain) physically prevents serving the dish. Furthermore, some dishes require multiple primary ingredients (e.g. Special Broken Rice requires Pork Chop, Shredded Pork Skin, and Steamed Egg Meatloaf).

## Decision

### 1. Multi-Primary Ingredient Flag (`is_primary`)

- Add `is_primary boolean DEFAULT false NOT NULL` to `public.recipes`.
- Each menu recipe allows selecting **one or multiple primary ingredients** (or none, in which case all lines default to primary for backwards compatibility).
- A dish's sellable stock capacity (`stock_capacity` and `stock_remaining`) is calculated as the bottleneck ($\min$) of its **primary ingredients only**.

### 2. Pre-Order Availability Gating

- `branch_menu_limit_availability` and `compute_menu_item_stock_capacity` calculate available portions based strictly on lines where `is_primary = true` (falling back to all lines if a menu item has no primary lines configured).
- `enforce_branch_stock_availability` (the trigger on `order_items`) hard-blocks order placement only when primary ingredients cannot satisfy the order demand.

### 3. Full Recipe Post-Sale Consumption & Food Cost (ADR 0026 Preserved)

- `post_pos_sale_consumption_if_ready` remains unchanged: after payment, **all recipe lines** (both primary and secondary) are posted to `public.stock_movements`.
- If secondary ingredients have insufficient stock at posting, ADR 0026 post-and-flag applies: negative stock is recorded, company WAC food cost is booked, and an inventory shortfall notification is emitted without rolling back the transaction.

### 4. Shared Physical Ingredient Demand Accounting

- Physical warehouse demand from pending orders (`pending_ingredient`) and active holds (`holds_ingredient`) is aggregated across **all valid recipe lines** (both primary and secondary).
- Example: If dish A uses Egg as secondary, and dish B uses Egg as primary:
  - An unfinalized order of dish A reserves 1 Egg from physical stock.
  - Dish B's remaining sellable capacity correctly accounts for the Egg reserved by dish A, preventing over-selling of shared physical stock.

### 5. Backward Compatibility & RPC Contract

- `upsert_recipe_lines` preserves existing `is_primary` flags if a legacy caller omits the field.
- `upsert_recipe_lines` preserves its public response contract: `{ "menu_item_id": bigint, "kept_count": integer }`.

## Consequences

- Menu items with missing secondary ingredients remain available for sale.
- Food cost and inventory ledgers maintain 100% accounting accuracy for all ingredients.
- Cashier pre-order gating enforces real operational availability without false negatives.
