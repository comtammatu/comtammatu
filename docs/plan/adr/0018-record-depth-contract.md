# ADR 0018 — Record Depth and row-open contract

**Status:** Accepted

**Decision owner:** Owner, amended 2026-07-29

## Context

Chrome, page archetypes, and UI blocks were defined, but row-open overlay choice
stayed soft. Inventory drifted across Page / `AppDialog` / `Sheet` / `Drawer` for
the same gesture.

## Decision

Adopt the **Record Depth Contract**: every list row is a record — one address,
one depth, three doors. Live recipe: `docs/spec/design-system.md` § C.1.

### Depth ladder

| Depth | Relationship | Owner frame | Branch frame | Address |
| --- | --- | --- | --- | --- |
| **D0 Scan** | Compare rows | LIST row | Touch `Item` row | List URL |
| **D1 Act** | One bounded decision / short edit | `AppDialog` or side `Sheet` | Bottom `Sheet` / `Drawer` | *View* → `?<entity>Id=`; *task* → none |
| **D1 Document** | List remains the workspace; one primary action per state | `AppDialog variant="document"` | Fullscreen bottom `Sheet` | `?<entity>Id=&mode=` |
| **D2 Read** | Independent workspace | DETAIL Page | Branch DETAIL Page | `{basePath}/{id}` |
| **D3 Author** | Line-array create/edit | `DocumentFormFrame` | Branch doc workflow | `{basePath}/new`, `/{id}/edit` |

Axes: (1) view vs task — views are addressable; tasks are not; (2) work home
decides depth — long-running session or >1 primary action escalates; (3) planes
share depth, not frame.

### Three doors (one `RowActionItem[]`)

1. Row body — exactly one destination at the declared depth.
2. Action cell — `RowActionsMenu` (+ at most one visible primary).
3. Context — additive only; never the sole path.

`Popover` is never a record view. A fake overflow `⋯` is drift.

### Locked Owner rulings

| ID | Ruling |
| --- | --- |
| **C0** | Record Depth SSOT + Inventory IA land alone. |
| **C1** | `/inventory/purchase-orders` stays LIST; no PO DETAIL; outside Wave 4 ratchet. |
| **C2** | Count slips/assignments are D1 view; bind `?slipId=` / `?assignmentId=`. |
| **C3** | Recipes stay D1 task until BOM lines **> 12**, then escalate. |
| **C4** | Zero-action LIST rows are legal. |
| **C5** | Three-door client rewires ship as batched PRs. |

Also locked: Record Depth hardens in design-system § C.1; PO stays in Inventory
sidebar as **`Đơn mua hàng`**; supplier invoices home `/finance/supplier-invoices`
(`REDIRECT-SHIM` from `/inventory/supplier-invoices`); short Inventory sidebar
daily IA; Owner site scope admits all `branch_kind`; Branch Stock is a separate
plane (ADR 0012); prune dead helpers, keep bookmark shims until retargeted.

### Per-record depths

| Record | Depth | Notes |
| --- | --- | --- |
| PO, GRN | D1 Document | Owner/Ops document dialog; legacy DETAIL redirects |
| YCH, Transfer | D1 Document Owner/Ops; D2 Branch | One fulfillment journey; Branch keeps DETAIL |
| Issue/consumption, stocktake session, production, stock card | D2 | DETAIL Page |
| Supplier invoice | D1 | Finance `Sheet` + `?invoiceId=` |
| Count slips / assignments | D1 view | Owner `AppDialog` / Branch `Sheet`; Wave 3 `?slipId=` / `?assignmentId=` |
| Waste approvals | D0 queue | Card decision surface (named LIST exception): Owner `AppPage` + `AppSection` decision cards — never `AppListFrame` / `DataTable` |
| Waste create, GRN create, stocktake new/count | D3 | `DocumentFormFrame` / counting grid. Owner GRN create DOC: context (`Kho nhận`) → lines table + `Thêm mặt hàng` → progressive editor → sticky footer (catalog picker is overlay, not a second page section). |
| Ingredients, units, categories, supplier edit | D1 task | `FormDialog` (no URL) |
| Recipes | D1 task | `FormDialog` until BOM lines **> 12**, then escalate to D2/Sheet/Page |
| Supplier items | D2 child LIST | `/suppliers/[id]/items` |

### Owner amendment (2026-07-29)

PO → GRN is list-first: open record + mode in URL query; row open uses push;
mode/close use replace. `AppDialog variant="document"` is the fixed document
frame. YCH → Transfer keeps separate plane chrome with one queue model and
canonical DETAIL pages. Legacy PO/GRN DETAIL routes redirect to query URLs.

## Consequences

- SSOT peers: design-system § C.1, `modules/ui.md` Overlay Decision,
  `page-archetypes.md` LIST row-actions, agent `ui.md` invariants.
- Adoption: three-door wiring (**C5**); remove duplicate views; count URL
  binding (**C2**); Wave 4 ratchet
  `apps/web/tests/record-depth-inventory-list-wave4-static.test.ts`; Wave 5
  list-first documents for PO/GRN and D2 fulfillment for YCH/Transfer.
- Does not invent a second table/theme component family.

## Verification

- Inventory sidebar lists PO as **`Đơn mua hàng`**; AP invoices redirect to Finance
  with query preserved.
- Short daily sidebar; stocktake/count/waste/reports/AP off sidebar leaves.
- Owner site filter admits all active `branch_kind`; Branch Stock stays separate.
- SSOT sections agree on Record Depth and Overlay Decision.
