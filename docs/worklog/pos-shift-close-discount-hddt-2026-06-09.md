# POS shift close discount + HĐĐT line discount hotfix

Date: 2026-06-09

## Scope

- Phiếu chốt ca phải thể hiện tổng Chiết khấu của các đơn đã thanh toán.
- Số lượng bán theo ngày / item breakdown trong ca phải sắp xếp theo Thành tiền từ cao xuống thấp.
- HĐĐT/CQT phải nhận dòng hàng đã phân bổ chiết khấu, để tổng tiền khai báo khớp số tiền khách trả sau chiết khấu.

Out of scope for this slice: full POS item-level discount UI/schema/RPC. That needs a separate money migration touching `order_items`, payment flows, receipts, reports, and realtime state. This hotfix keeps the existing order-level discount control but allocates that amount to invoice lines before calling the provider.

## T3 Debate

PM:
- The highest-risk defect is paid amount < declared HĐĐT amount, because it makes the business owe tax on money not collected.
- The fastest safe win is to make existing POS discounts flow into invoice line discounts and make shift close reports transparent.
- Item-level discount UI remains important, but shipping it without DB/report/payment contract coverage would create a second money surface.
- Success: owner sees discount on close report; CQT/provider totals match discounted order total.

BA:
- Only paid, non-cancelled orders should contribute to close-session revenue, item counts, and discounts.
- Cash expected remains a cash collection number; discount is a separate reduction, not a payment method.
- HĐĐT line amounts must preserve legal item names/quantities while allocating the order discount proportionally and never exceeding a line amount.
- If invoice submission fails, payment state must not be rolled back in this patch.

Senior Dev:
- Reuse the existing invoice line builder so modifiers/sides stay represented as legal lines.
- Add a small discount allocation helper in shared HĐĐT code and have the Viettel provider emit `discount` / `itemDiscount` plus reconciled summary totals.
- Update SQL RPC payloads/render-block functions through a forward migration; do not invent a parallel reporting path.
- Keep print-agent legacy and document renderers aligned because deployed printers may use either rendering mode.

QA:
- Add shared tests proving allocated line discounts sum to the order discount and Viettel direct/VAT modes reconcile.
- Add static coverage so create and replacement HĐĐT paths both include `discount_amount` and call allocation.
- Add print rendering coverage for the visible Chiết khấu row.
- Required gates: targeted tests first, then `pnpm typecheck && pnpm lint && pnpm build`.

## Environment Note

`supabase` CLI is not installed in this workspace shell, so this change will create the migration file but will not apply it locally here. The owner/dev environment must apply it to the approved dev/test Supabase target before regenerating DB types, if generated type signatures change.
