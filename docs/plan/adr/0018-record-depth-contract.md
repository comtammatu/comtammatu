# ADR 0018 — Record Depth and row-open contract

**Status:** Accepted

**Decision owner:** Owner, 2026-07-28

## Context

The Design System already defines Chrome Archetypes (which shell), Page
Archetypes (which page), and UI Blocks (which composition). Overlay choice for
opening a list row remained soft: one Inventory-scoped bullet and no shared
view-versus-task axis. Inventory drift followed — Page vs `AppDialog` vs `Sheet`
vs `Drawer` for the same “open row” gesture, fake overflow affordances, and
ContextMenu adoption on a single LIST.

## Decision

Adopt the **Record Depth Contract**:

> Every list row is a record: one address, one depth, three doors.

### Depth ladder

| Depth | Relationship | Owner frame | Branch frame | Address |
| --- | --- | --- | --- | --- |
| **D0 Scan** | Compare rows | LIST row | Touch `Item` row | List URL owns filters |
| **D1 Act** | One bounded decision / short edit | `AppDialog` or side `Sheet` | Bottom `Sheet` / `Drawer` | *View* → `?<entity>Id=`; *task* → none |
| **D2 Read** | Record is the workspace | DETAIL Page | Branch DETAIL Page | `{basePath}/{id}` |
| **D3 Author** | Create/edit a line-array document | `DocumentFormFrame` | Branch doc workflow | `{basePath}/new`, `/{id}/edit` |

Axes:

1. **View vs task** — a view is a place (must be addressable and survive
   reload/share/back); a task ends (must not be addressable).
2. **Weight escalates depth** — line array, audit/`Lịch sử` tab, stage footer, or
   more than one primary action → D2/D3, not a short overlay view.
3. **Planes share depth, not frame** — Owner and Branch declare the same depth
   for the same record and may differ in frame at that depth.

### Three doors (one `RowActionItem[]`)

1. Row body (`onRowClick` / `Link`) — exactly one destination: the declared depth.
2. Action cell — `RowActionsMenu` (plus at most one visible primary control).
3. Context — `DataTable renderRowContextMenu` + `RowActionsContextMenuItems`
   (additive only; never the sole path).

`Popover` is never a record-view door. An overflow `⋯` that is actually a link
or bare icon pair is drift.

### Locked Owner rulings (2026-07-28)

**Wave 0 checkpoints (C0–C5):**

| ID | Ruling |
| --- | --- |
| **C0** | Wave 0 (Record Depth SSOT + Inventory IA) lands alone; auth/scroll/POS/HR stay out of this changeset. |
| **C1** | `/inventory/purchase-orders` is a **frozen non-nav** route: keep route + RPC for integrity; no sidebar entry, no new DETAIL, no further daily-UI investment. |
| **C2** | Count slips / assignments are **D1 view**. Wave 3 binds addressable `?slipId=` / `?assignmentId=` (Owner `AppDialog` / Branch bottom `Sheet` at the same depth). Do not implement URL binding in Wave 0. |
| **C3** | Recipes stay **D1 task** (`FormDialog`) for now. Escalate to D2 / Sheet / Page when a recipe BOM has **more than 12 lines**. No recipe UI migrate in Wave 0. |
| **C4** | Zero-action LIST rows are legal (e.g. transfers / production may omit an action cell). Wave 1 removes bare icon pairs; it does not invent menus where no actions exist. |
| **C5** | Wave 1 client rewires ship as **three batched PRs** later — not this changeset. |

Other locked rulings:

1. Record Depth is the unifying contract (harden into `design-system.md` § C.1).
2. Purchase Orders stay withdrawn from daily UI (D073 / `modules/ui.md`); remove
   from Inventory nav; do not build a PO DETAIL route (**C1**).
3. Supplier invoices home is `/finance/supplier-invoices`; `/inventory/supplier-invoices`
   is a `REDIRECT-SHIM` preserving query (`invoiceId`, filters).
4. Inventory sidebar materializes live warehouse/cost routes (stocktake, count
   assignments/slips, waste approvals, reports) plus Finance AP link.
5. Owner `Sheet` is legal as a D1 addressable-overlay frame; count slips /
   assignments keep Owner `AppDialog` / Branch `Sheet` at the same depth (**C2**
   — URL params in Wave 3).
6. Dual plane: same depth, different frame.
7. `?<entity>Id=` addressable overlays are a blessed D1 tier (not transitional).
8. Per-record depths:

| Record | Depth | Notes |
| --- | --- | --- |
| GRN, transfer, issue/consumption, stocktake session, production, stock card | D2 | DETAIL Page |
| Supplier invoice | D1 | Finance `Sheet` + `?invoiceId=` |
| Count slips / assignments | D1 view | Owner `AppDialog` / Branch `Sheet`; Wave 3 `?slipId=` / `?assignmentId=` |
| Waste approvals | D0 queue | Card decision surface (named LIST exception) |
| Waste create, GRN create, stocktake new/count | D3 | `DocumentFormFrame` / counting grid |
| Ingredients, units, categories, supplier edit | D1 task | `FormDialog` (no URL) |
| Recipes | D1 task | `FormDialog` until BOM lines **> 12**, then escalate to D2/Sheet/Page |
| Supplier items | D2 child LIST | `/suppliers/[id]/items` |

## Consequences

- SSOT peers: `design-system.md` § C.1, `modules/ui.md` Overlay Decision,
  `page-archetypes.md` LIST row-actions, `ui.md` operational invariants.
- Adoption waves: (1) wire three doors from shared `RowActionItem[]` in three
  batched PRs (**C5**); (2) remove duplicate view paths; (3) depth migrations
  including count `?slipId=` / `?assignmentId=` (**C2**); (4) optional ratchet
  gate (row-open / Record Depth).
- Does not invent new components, a second theme, or an `InventoryDataTable`.
- Zero-action LIST is legal (**C4**); ContextMenu is required only when an
  action cell is rendered.

## Self-T3 (four lenses)

- **PM:** Smallest accepted outcome is a named contract plus IA/home lock so
  agents stop inventing overlay taste. Code polish is a later wave.
- **BA:** View/task, weight triggers, plane depth parity, and the per-record
  table are the enforceable rules; PO and invoice home contradictions close.
- **Senior Dev:** Doc + nav + one redirect shim; leave PO route/RPC history;
  client stays under Finance. Blast radius is Inventory IA and SSOT readers.
- **QA:** Redirect preserves `invoiceId`; nav tests flip from “hidden” to
  “required” for materialized leaves; PO nav assertion inverts; archetype map
  marks inventory invoices as `REDIRECT-SHIM`.

## Verification

- Inventory nav no longer lists `/inventory/purchase-orders`.
- `/inventory/supplier-invoices` redirects to `/finance/supplier-invoices` with
  query preserved.
- Sidebar exposes stocktake, count, waste approvals, reports, and Finance AP.
- SSOT sections agree on Record Depth and Overlay Decision.
