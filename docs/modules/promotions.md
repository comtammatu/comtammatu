# Promotions Module

Owner campaign catalog and POS redemption. Money still lands on existing order
and item discount columns (ADR 0039, ADR 0013).

**Owner:** `/promotions` (LIST), `/promotions/new`, `/promotions/[id]`
(DOC-WORKFLOW, kind-first). Keys `promo:read` / `promo:write` / `promo:issue`.
**POS:** `/br/[branchId]/pos` — `Mã giảm` / auto chip / free-side and free-item picker.
Apply and selection use `pos:use`; manual `Chiết khấu` uses
`pos:apply_discount`.
**Self-Order:** `/q/[token]` G6 — guest enters their own reusable `promo_code` or
unique `voucher_code` (`order_pct` / `order_vnd` / `voucher_face` only). RPCs:
`self_order_apply_promotion_code`, `self_order_clear_promotion` (`service_role`).
Picker kinds (`free_side`, `free_item`, `bxgy`) fail closed for guests.
**Domain:** `apps/web/lib/promotions`. Mutations: `upsert_promotion`,
`apply_promotion_code`, `apply_free_side_selection`, `apply_free_item_selection`,
`clear_promotion`,
`evaluate_order_promotions`, `preview_promotion_code`, `issue_promotion_codes`,
`void_promotion_code`, `self_order_apply_promotion_code`,
`self_order_clear_promotion`.
**Kinds:** `order_pct`, `order_vnd`, `voucher_face`, `auto_order`, `bxgy`,
`free_side` (N free side portions **per qualifying main unit**; `buy`/`get` items;
`allow_code` / `allow_auto`), `free_item` (staff picks 1..eligible units **per
order** already on the bill; optional `free_item_qty` cap, `NULL` = no campaign
cap; `get` items; code-only; always picker).
**Out of scope:** loyalty, platform codes, combo engine, voucher SKUs, mutating
`order_items.sides` prices, Google-review verification.
