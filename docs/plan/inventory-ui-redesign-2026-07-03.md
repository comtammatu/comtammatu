# Inventory UI — redesign về chuẩn (2026-07-03)

> Reconciled-through a7a5d9e6
> Owner: Inventory UI "tự custom Components quá nhiều, bể layout, chữ đè, không theo khung nào, loạn".
> Không design system mới — ép mọi surface Inventory về chuẩn sẵn có: `docs/spec/page-archetypes.md`
> recipes + `surface.tsx` adapters + Operator Embedded Contract (D058/D059, one-implementation-two-roots).
> Audit read-only 3 lane. Fix theo wave; mỗi wave = 1 PR mạch lạc.

## Chẩn đoán — 3 root pattern

- **A — width-tier tự do (nguồn chính "không theo khung nào").** Gate `check-ui-contract.mjs`
  chỉ enforce archetype *có mặt*, không enforce nội dung recipe → mỗi LIST tự chọn width. Rải:
  `xwide` (purchase-orders, grn, stocktake, transfers), `wide` (issues, supplier-invoices,
  supplier-returns, recipes), `default`/none (waste/approvals), bespoke
  (`ingredients-client.tsx:485` no width + `contentClassName="max-md:max-w-2xl"`;
  `grn-list-client.tsx:295` `max-md:max-w-xl`). Spec §3 LIST chưa pin width → drift hợp lệ.
- **B — bỏ primitive load-bearing.** 3 LIST render `Item/ItemGroup/.map`, zero DataTable + zero
  AppToolbar: `count-slips-client.tsx`, `count-assignments-client.tsx`, `waste/approvals/waste-approvals-client.tsx`.
  3 nữa thiếu AppToolbar: `recipes-client.tsx`, `supplier-returns-client.tsx`, `transfers` (search tách
  InputGroup + Tabs riêng).
- **C — thiếu `min-w-0`/`truncate` trên table tự chế (overlap thật duy nhất).** Base `<Table>`
  (`packages/ui/src/components/table.tsx:11`) đã bọc `overflow-x-auto` → mọi thứ qua DataTable an toàn.
  Vỡ thật = `new-po-client.tsx:1095-1099` grid tự chế `grid-cols-[2fr_80px_70px_120px_120px_40px]`, name
  span không truncate/min-w-0 → tên dài đè cột Qty. **= "bể layout, chữ đè".** Cùng class nhẹ hơn:
  `reports-client.tsx:93` legend no flex-wrap, `:227` variance row no truncate, `supplier-invoices-client.tsx:570` mono code.

B và C cùng gốc: **tự chế surface thay vì dùng adapter.** Route qua adapter → cả 2 tự khỏi.

## Wave

**Wave 1 — chặn vỡ nhìn thấy (safe-now, không schema, không đụng Phase A/B).** DONE (PR #226).
- `new-po-client.tsx:1097-1099` — `truncate min-w-0` vào name span. **Bug anh báo.**
- `reports-client.tsx:93` `flex-wrap`; `:218-234` `min-w-0`+`truncate`+`shrink-0`.
- `supplier-invoices-client.tsx:570` `truncate`.

**Wave 1b — un-nest settings AppPage.** THIS PR.
- Gỡ double/triple-nested AppPage: `settings/qc/{page,qc-settings-client}.tsx` + `settings/expiry/page.tsx`
  → page own AppPageHeader, client render embedded/headerless (khớp categories/units/thresholds).

**Wave 2 — pin 1 width tier + normalize mọi LIST shell (Pattern A, systemic).** Sửa `page-archetypes.md
§3 LIST` pin width (đề xuất `xwide` theo exemplar purchase-orders), rồi normalize freelancer. LEVERAGE
điểm cao nhất — kill "no framework" feeling nhất. Safe cho LIST non-catalog; `ingredients-client.tsx`
đụng A2 → sequence sau Phase A. Sau đó thêm width-signature check vào gate để drift không tái nhập.

**Wave 3 — 6 LIST body-freelance về recipe (Pattern B).**
- Migrate AppToolbar+DataTable: `recipes`, `supplier-returns`, `transfers`.
- 3 queue non-tabular (`count-slips`, `count-assignments`, `waste/approvals`): **owner quyết** migrate DataTable
  vs thêm vào §4 Named Exceptions (sanctioned). `production`/`recipes` đụng Phase A/B → chờ.

**Wave 4 — 2 archetype declare sai + tiếp DOC-WORKFLOW.**
- `check-ui-contract.mjs`: `drafts/page.tsx` LIST→REDIRECT-SHIM (là redirect); `production/page.tsx`
  declare HUB nhưng render table → rebuild HUB recipe hoặc re-declare + §4 exception (**owner quyết**).
- Migrate `purchase-orders/new` + `grn/new/[supplierId]` sang DocumentFormFrame (giết luôn twin-tree
  `md:hidden` ratchet). **Chờ Phase B** (rewrite unit dropdown cùng file).

## Collision với unit-system Phase A/B + reset

- **CHỜ**: DocumentFormFrame migration new-po/grn (Phase B rewrite unit dropdown), `ingredients-client`
  shell (A2 rewrite ingredient form), recipes/production body (Phase A/B scope).
- **SAFE NOW**: toàn bộ Wave 1/1b, Wave 2 cho LIST non-catalog, settings double-nest, 2 archetype re-mapping.

## Owner quyết
1. Wave 2 width tier: `xwide` hay `wide`?
2. Wave 3: 3 queue page → migrate DataTable hay sanctioned §4 exception?
3. Wave 4: `production` → rebuild HUB hay re-declare archetype thật?
