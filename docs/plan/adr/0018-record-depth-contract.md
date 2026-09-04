# ADR 0018 — Record Depth and row-open contract

**Status:** Accepted

**Decision owner:** Owner

Live recipe: [`docs/spec/design-system.md`](../../spec/design-system.md) § C.1.
This ADR owns the locked rulings; do not copy overlay chrome from here.

## Decision

Every list row is a record — one address, one depth, three doors.

| Depth | Owner frame | Branch frame | Address |
| --- | --- | --- | --- |
| **D0 Scan** | LIST row | Touch `Item` row | List URL |
| **D1 Act** | `AppDialog` / side `Sheet` | Bottom `Sheet` / `Drawer` | View → `?<entity>Id=`; task → none |
| **D1 Document** | `AppDialog variant="document"` | Fullscreen bottom `Sheet` | `?<entity>Id=&mode=` |
| **D2 Read** | DETAIL Page | Branch DETAIL Page | `{basePath}/{id}` |
| **D3 Author** | `DocumentFormFrame` | Branch doc workflow | `/new`, `/{id}/edit` |

Three doors (one `RowActionItem[]`): row body, action cell, context (additive
only). `Popover` is never a record view.

### Locked rulings

| ID | Ruling |
| --- | --- |
| **C0** | Record Depth SSOT + Inventory IA land together. |
| **C1** | `/inventory/purchase-orders` stays LIST; no PO DETAIL. |
| **C2** | Count slips/assignments are D1 view (`?slipId=` / `?assignmentId=`). |
| **C3** | Recipes stay D1 task until BOM lines **> 12**, then escalate. |
| **C4** | Zero-action LIST rows are legal. |
| **C5** | Three-door client rewires ship as batched PRs. |

PO stays **`Đơn mua hàng`** in Inventory. Supplier invoices home
`/finance/supplier-invoices`. Branch Stock is a separate plane (ADR 0012).
PO / GRN / production are list-first D1 documents (`?id=&mode=`).

## Verification

Inventory sidebar lists PO as **`Đơn mua hàng`**; AP invoices redirect to
Finance with query preserved. Owner site filter admits all active
`branch_kind`; Branch Stock stays separate.
