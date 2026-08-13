# ADR 0039 — Promotions and voucher codes

**Status:** Accepted

**Decision owner:** Owner, 2026-08-13 (implement plan Accept)

**Review tier:** T3 — money, multi-row RPC, RLS, HĐĐT totals

**Amends:** none. Money projection remains ADR 0034.

## Context

POS already has discretionary discounts (order `%`/`vnd`, item `vnd` only) that
materialize onto `orders.order_discount_amount` / `order_items.discount_amount`.
HĐĐT, print, shift-close, and finance net revenue consume those columns. There
is no campaign catalog, reusable code, unique voucher, time-window auto apply,
or buy-X-get-Y.

Owner required a full engine, Owner-only catalog management, and no
Branch-Manager-created codes. CRM/loyalty stays out of scope (ADR 0025).

## Decision

### 1. Attribution, not a second money path

Campaigns and codes **attribute** a discount. Apply/clear RPCs still write the
existing discount columns. `discount_note` stores the campaign name and code for
print. `orders.promotion_id` / `orders.promotion_code_id` are fast POS handles.

### 2. One order-level commercial discount

Manual `chiết khấu` XOR campaign/code XOR auto order discount. Replacing one with
the other is explicit clear-then-apply. Silent stacking of two order-level
amounts is rejected (`promotion_already_applied` / `promotion_clear_required`).

Item-level VND discounts may coexist unless the campaign sets
`stack_with_item_discount = false`.

### 3. Kind map

| Kind | Apply surface | Money landing |
| --- | --- | --- |
| `order_pct` / `order_vnd` | Cashier enters reusable `promo_code` | Order-level `%` or VND |
| `voucher_face` | Cashier enters unique `voucher_code` | Order-level VND, clamped to payable; code burns atomically |
| `auto_order` | `evaluate_order_promotions` when eligible and no order-level discount exists | Order-level `%` or VND; a cashier code wins over auto |
| `bxgy` | Same evaluate RPC | Item-level VND on cheapest qualifying lines (ADR 0034) |

Buy X get Y never uses order `%`. Kitchen still sees full qty (commercial
comp, not a void).

### 4. Schedule, lock, zero-total, restructure

- Timezone is `Asia/Ho_Chi_Minh` (same as business dates).
- `payment_code_locked` still blocks amount changes.
- A campaign that zeros `total_amount` stays ADR 0034 (`not_required`, no Viettel job).
- Merge or split while `promotion_id` is set fails closed
  (`merge_promotion_blocked` / `split_promotion_blocked`). Cashier clears first.

### 5. Authority

- Catalog: Owner-only `/promotions`. Keys `promo:read`, `promo:write`,
  `promo:issue` (tenant scope, not delegable). Empty `promotion_branches` means
  every selling branch.
- Manual `chiết khấu`: `pos:apply_discount`.
- Published code, unique voucher, and auto: `pos:use` (amount is Owner-configured).

Cashiers never write catalog tables. Apply/clear/evaluate/preview are
`SECURITY DEFINER` RPCs.

### 6. Unique voucher restore

Clearing a unique voucher before pay restores the code to `active` and decrements
`redeemed_count` in the same RPC. Paid redemptions stay burned.

### 7. Placement

`apps/web/lib/promotions` + Postgres RPCs. No new package (ADR 0025).

## Non-goals

loyalty accounts, points, platform (Grab/Shopee) codes, combo-as-engine (combo
stays a menu price), selling vouchers as inventory SKUs.

## Consequences

- HĐĐT/print/finance keep their current discount readers.
- POS discount sheet gains a **`Mã giảm`** path beside **`Chiết khấu`**.
- Owner LIST `/promotions` and DOC-WORKFLOW `/promotions/new` + `/promotions/[id]`.

## Canonical

- Glossary: `promotion`, `promo_code`, `voucher_code`
- Screen context: POS §2.1; Owner promotions spine
- Module: `docs/modules/promotions.md`
