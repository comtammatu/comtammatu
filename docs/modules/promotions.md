# Promotions Module

Owner campaign catalog and POS redemption. Money still lands on existing order
and item discount columns (ADR 0039, ADR 0034).

**Owner:** `/promotions` (LIST), `/promotions/new`, `/promotions/[id]`
(DOC-WORKFLOW). Keys `promo:read` / `promo:write` / `promo:issue`.
**POS:** `/br/[branchId]/pos` — `Mã giảm` / auto chip. Apply uses `pos:use`;
manual `Chiết khấu` uses `pos:apply_discount`.
**Domain:** `apps/web/lib/promotions`. Mutations: `upsert_promotion`,
`apply_promotion_code`, `clear_promotion`, `evaluate_order_promotions`,
`preview_promotion_code`, `issue_promotion_codes`, `void_promotion_code`.
**Out of scope:** loyalty, platform codes, combo engine, voucher SKUs.
