# POS item-level discount migration

Date: 2026-06-09

## Scope

- Add item-level discount metadata to `order_items`.
- Keep `orders.discount_amount` as the total discount number used by payment, receipts, reports, shift close, and HĐĐT.
- Split order discount provenance into `orders.order_discount_amount` and `orders.item_discount_amount`.
- Add RPCs to apply/clear a discount on a single order item before payment.
- Add POS item action to open the same discount sheet for a selected item.
- Make HĐĐT prefer item-level line discounts and allocate only the remaining order-level discount.

## T3 Debate

PM:
- This should close the remaining product gap: cashier can discount a specific dish instead of only the whole order.
- Acceptance: discounted item reduces payable total immediately, receipt/report totals still use the same total discount number, and HĐĐT sends the discounted line to CQT.
- Keep order-level discount support for legacy vouchers and whole-ticket promotions; do not remove it in this migration.
- This is a money migration, so the smallest complete slice is DB contract + RPC + POS action + HĐĐT payload.

BA:
- Item discounts are pre-payment only; paid/completed/cancelled orders cannot be edited.
- Discount type/value/note rules mirror order discount: `pct` or `vnd`, non-negative, note at least 3 characters, zero amount is rejected for apply and clear requires a reason.
- `orders.discount_amount = orders.order_discount_amount + orders.item_discount_amount`; `orders.total_amount = subtotal + service_charge - discount_amount`.
- Item-level discount cannot exceed that active item's `subtotal`; order-level VND discount clamps against the remaining undiscounted base after item discounts.

Senior Dev:
- Add columns rather than overloading `orders.discount_type`; update the paired constraint to refer to `order_discount_amount`.
- Keep `subtotal` fields gross/list-price so reports can still show gross and discount separately.
- Recompute totals inside Postgres RPC with row locks/advisory locks; do not issue multiple client writes.
- Reuse the existing `DiscountSheet` in item context and avoid a second UI pattern.

QA:
- Static tests must prove finance actions fetch item discount snapshots and item discount RPC/action exists.
- Unit/provider tests must cover item-level HĐĐT discounts plus remaining order-level allocation.
- Print/report gates from the prior discount patch must still pass.
- Required gates: targeted tests first, then `pnpm typecheck`, `pnpm lint`, `pnpm build`.

## Environment Note

Supabase CLI is not installed in this shell (`supabase: command not found`), so the migration file is authored manually and cannot be applied locally here. Apply it only to an approved dev/test target first, then run `pnpm db:types` from that environment before production PR/owner apply.
