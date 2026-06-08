# POS discount, HĐĐT, and shift-close report — T3 contract

## Scope

- Phiếu chốt ca must show discount total and its item breakdown must sort by
  `Thành tiền` descending.
- HĐĐT provider payload must carry discounts on invoice lines so CQT totals are
  reduced by the discount amount instead of reporting full menu price.
- True POS per-item discount storage is not added in this slice because
  `order_items` currently has no discount columns and `orders.discount_amount`
  is constrained as order-level metadata. Adding it safely requires a separate
  schema/RPC recompute contract.

## Four perspectives

PM: Ship the tax-loss fix and shift report correction first. Acceptance is:
closed-shift print/report includes discount, sold item rows sort by revenue, and
Sinvoice payload sends non-zero line/item discount when an order has a discount.

BA: Existing business rule is order-level discount. For HĐĐT, allocate that
discount proportionally across active invoice lines, cap it to the line/order
amount, and keep provider totals equal to the customer-paid amount. Cancelled
items remain excluded.

Senior Dev: Keep the fix in shared HĐĐT line building/provider math and the
existing session-report/shift-print RPC payload. Do not reinterpret
`orders.discount_amount` or add partial `order_items` discount fields in this
change.

QA/QC: Cover allocation and provider summary tests in `@comtammatu/shared`.
For SQL, verify static text for `discount_total` in shift-close payload and
`ORDER BY revenue DESC` for item report/print rows. Full repo gates remain
`pnpm typecheck && pnpm lint && pnpm build`.

## Resolution

Implement line-level invoice discounts from current order-level discounts now.
Leave true POS item-discount authoring as a follow-up T3 because it touches
order item schema, payment recompute, split/merge/void/reduce RPCs, reports,
receipts, and generated database types.

## Phase 2: POS per-item discount schema/RPC contract

PM: The next acceptance target is not just a button. POS must be able to set
or clear a discount on one order item, payment must recompute from server-side
line totals, shift/finance reports must count the discount, and HĐĐT must send
discounts directly on legal invoice lines.

BA: Keep `orders.discount_amount` as order-level discount metadata, and add
`orders.item_discount_amount` as the sum of active `order_items.discount_amount`.
Line discounts support the same `pct|vnd` rules as order discounts, require a
note, and are blocked after payment or terminal order state. If both item and
order discounts exist, order-level discount is computed against the remaining
amount after item discounts so total discount cannot exceed item subtotal.

Senior Dev: Add line discount columns to `order_items`, an internal
`private.recompute_order_totals(order_id)` helper, and a public
`apply_order_item_discount(...)` RPC. All subtotal mutation paths must call the
helper or preserve its formula: create/append/edit/reduce/void/cancel/split/
merge/out-of-stock/service-charge/payment/print/report/HĐĐT. Keep the existing
order-level `apply_order_discount` and `clear_order_discount` APIs compatible.

QA/QC: Cover invoice builder allocation for item + order discounts, provider
payload totals, static SQL contract for `item_discount_amount` and
`apply_order_item_discount`, and run targeted shared tests, typecheck, lint,
and build. Full repo lint may still be blocked by the unrelated dead-doc
references currently present in the dirty worktree.

## Phase 2 result

- Added `orders.item_discount_amount` and line discount metadata on
  `order_items` through forward migration
  `supabase/migrations/20260608090000_pos_item_discount_hddt_shift_close.sql`.
  The lean baseline stays a regenerated artifact from
  `supabase/greenfield/verify/build-lean.sh`; do not hand-author this feature
  directly into `00000000000000_baseline.sql` until the prod-first regen path
  carries it naturally.
- Added `private.recompute_order_item_discount`,
  `private.recompute_order_totals`, `apply_order_item_discount`, and
  `clear_order_item_discount`.
- Routed order total recompute through the helper for append/edit/reduce/void,
  cancel, split, merge, KDS out-of-stock, service charge, and payment
  completion paths.
- Shift close, finance revenue reports, VAT split, materialized revenue/top
  item views, bill/receipt print payloads, and HĐĐT line building now count
  item discounts.
- POS order detail exposes "Chiết khấu món" from the item action sheet using
  the same discount form as order-level discount.

Verification on 2026-06-07:

- `pnpm --dir apps/web typecheck` passed.
- `pnpm typecheck` passed.
- `pnpm --filter @comtammatu/shared exec tsx --test 'src/hddt/__tests__/*.test.ts'`
  passed.
- `pnpm --filter @comtammatu/web lint` passed with existing warning-only
  i18n noise.
- `pnpm --filter @comtammatu/shared lint` passed.
- `pnpm build` passed.
- `pnpm lint` remains blocked before ESLint by pre-existing missing doc
  references in `tasks/todo.md`, `apps/web/app/_lib/rpc-error-map.ts`,
  `apps/web/app/(protected)/br/[branchId]/pos/_lib/schemas.ts`, and
  `scripts/supabase-baseline-extract.mjs`.

Schema sync on 2026-06-08:

- Another agent landed `1a81f719`, restructuring `supabase/` so
  `supabase/migrations/00000000000000_baseline.sql` is a lean HKD baseline
  artifact regenerated from prod by `build-lean.sh`.
- The POS item-discount SQL was moved out of the hand-edited baseline and into
  the forward migration above. The baseline file was restored clean to HEAD.
- `packages/shared/src/hddt/__tests__/pos-item-discount-schema.test.ts` now
  verifies the migration chain and intentionally asserts that
  `apply_order_item_discount` is not authored directly inside the lean baseline
  artifact.
