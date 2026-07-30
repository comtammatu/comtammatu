# ADR 0018 — Record Depth and row-open contract

**Status:** Accepted

**Decision owner:** Owner, amended 2026-07-29

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
| **D1 Document** | List remains the workspace; one primary action per state | `AppDialog variant="document"` | Fullscreen bottom `Sheet` | `?<entity>Id=&mode=` |
| **D2 Read** | Record is an independent workspace | DETAIL Page | Branch DETAIL Page | `{basePath}/{id}` |
| **D3 Author** | Create/edit a line-array document | `DocumentFormFrame` | Branch doc workflow | `{basePath}/new`, `/{id}/edit` |

Axes:

1. **View vs task** — a view is a place (must be addressable and survive
   reload/share/back); a task ends (must not be addressable).
2. **Work home decides depth** — a long-running independent session or more
   than one primary action in the same state escalates to D2/D3. A line array
   or stage footer alone does not escalate an approved D1 Document.
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
| **C1** | `/inventory/purchase-orders` is a **LIST** in Inventory sidebar daily IA (Owner restore 2026-07-28). Keep route + RPC; no new DETAIL; do not expand Wave 4 row-open ratchet into PO. |
| **C2** | Count slips / assignments are **D1 view**. Wave 3 binds addressable `?slipId=` / `?assignmentId=` (Owner `AppDialog` / Branch bottom `Sheet` at the same depth). Do not implement URL binding in Wave 0. |
| **C3** | Recipes stay **D1 task** (`FormDialog`) for now. Escalate to D2 / Sheet / Page when a recipe BOM has **more than 12 lines**. No recipe UI migrate in Wave 0. |
| **C4** | Zero-action LIST rows are legal (e.g. transfers / production may omit an action cell). Wave 1 removes bare icon pairs; it does not invent menus where no actions exist. |
| **C5** | Wave 1 client rewires ship as **three batched PRs** later — not this changeset. |

Other locked rulings:

1. Record Depth is the unifying contract (harden into `design-system.md` § C.1).
2. Purchase Orders stay in the simplified Inventory sidebar as **Đơn mua hàng**
   (**C1** Owner restore); do not build a PO DETAIL route.
3. Supplier invoices home is `/finance/supplier-invoices`; `/inventory/supplier-invoices`
   is a `REDIRECT-SHIM` preserving query (`invoiceId`, filters).
4. Inventory sidebar stays the short daily IA (stock, GRN, PO, consumption,
   transfers, production, catalog). Stocktake, count, waste approvals, reports,
   and Finance AP remain reachable by URL / in-page links, not sidebar leaves.
5. **Owner Inventory site scope = all kinds equally** — `branch`,
   `central_supply`, and `central_kitchen` share one `?branchId=` filter; no
   “central is home / branch is oversight-only” default.
6. **Branch Stock is a separate plane** — `/br/[branchId]/stock/*` does not
   mirror Owner shell, sidebar, or primary CTAs (ADR 0012). Record Depth may
   match per record type; IA/nav/chrome must not.
7. Owner `Sheet` is legal as a D1 addressable-overlay frame; count slips /
   assignments keep Owner `AppDialog` / Branch `Sheet` at the same depth (**C2**
   — URL params in Wave 3).
8. Dual plane: same depth, different frame — not the same as sharing Inventory
   IA between Owner and Branch Stock.
9. Prune policy: DELETE dead helpers/routes; KEEP bookmark/ADR shims until
   callers retarget; MOVE non-Inventory homes (AP actions → Finance); retire
   temporary shims after canonical CTAs land (`/inventory/operations` deleted).
10. `?<entity>Id=` addressable overlays are a blessed D1 tier (not transitional).
11. Per-record depths:

| Record | Depth | Notes |
| --- | --- | --- |
| PO, GRN | D1 Document | Owner/Ops `AppDialog variant="document"`; legacy DETAIL routes redirect |
| YCH, Transfer | D2 workflow | Shared fulfillment hub; canonical Owner/Ops and Branch DETAIL pages |
| Issue/consumption, stocktake session, production, stock card | D2 | Independent DETAIL Page |
| Supplier invoice | D1 | Finance `Sheet` + `?invoiceId=` |
| Count slips / assignments | D1 view | Owner `AppDialog` / Branch `Sheet`; Wave 3 `?slipId=` / `?assignmentId=` |
| Waste approvals | D0 queue | Card decision surface (named LIST exception): Owner `AppPage` + `AppSection` decision cards — never `InventoryListFrame` / `DataTable` |
| Waste create, GRN create, stocktake new/count | D3 | `DocumentFormFrame` / counting grid. Owner GRN create DOC: context (`Kho nhận`) → lines table + Thêm mặt hàng → progressive editor → sticky footer (catalog picker is overlay, not a second page section). |
| Ingredients, units, categories, supplier edit | D1 task | `FormDialog` (no URL) |
| Recipes | D1 task | `FormDialog` until BOM lines **> 12**, then escalate to D2/Sheet/Page |
| Supplier items | D2 child LIST | `/suppliers/[id]/items` |

### Owner amendment (2026-07-29)

PO → GRN is a list-first operational chain. Its canonical record view
keeps the list mounted and stores the open record plus mode in URL query
parameters. Row open uses push so Browser Back closes the overlay; view/edit
mode changes and explicit close use replace while retaining filters, site, tab,
pagination, and scroll context.

`AppDialog variant="document"` provides one fixed document frame: a status and
relationship header, independently scrolling metadata/lines/evidence body, and
a fixed footer with destructive/close actions separated from the single
primary action.

YCH → Transfer is a job-based fulfillment chain. Owner/Ops and Branch retain
separate route families and chrome, but both use one queue model and canonical
DETAIL pages for YCH and Transfer. The old `{basePath}/{id}` routes for PO,
and GRN remain bookmark shims that redirect to the canonical query URL.

## Consequences

- SSOT peers: `design-system.md` § C.1, `modules/ui.md` Overlay Decision,
  `page-archetypes.md` LIST row-actions, `ui.md` operational invariants.
- Adoption waves: (1) wire three doors from shared `RowActionItem[]` in three
  batched PRs (**C5**); (2) remove duplicate view paths; (3) depth migrations
  including count `?slipId=` / `?assignmentId=` (**C2**); (4) ratchet gate
  (`row-open-single-path` — Wave 4 static test, live).
- Does not invent new components, a second theme, or an `InventoryDataTable`.
- Zero-action LIST is legal (**C4**); ContextMenu is required only when an
  action cell is rendered.

### Adoption status (Inventory)

- **Wave 3 (C2 URL binding):** Owner `/inventory/count-slips` binds D1 review
  to `?slipId=`; `/inventory/count-assignments` binds D1 editor to
  `?assignmentId=` (employee id). Invalid or out-of-scope ids clear from the
  URL. Waste create remains D3; waste approvals remain D0 queue (no fake DETAIL
  / addressable overlay).
- **Wave 4 (row-open-single-path ratchet):** Live static gate
  `apps/web/tests/record-depth-inventory-list-wave4-static.test.ts` fails when
  Inventory LIST surfaces (Waves 1–3 scope) reopen records via competing paths
  (Drawer/long-press, Popover-as-detail, fake `⋯`, dual overlay frames). ADR
  carve-outs remain: **C4** zero-action LIST, **C1** PO LIST outside Wave 4
  row-open ratchet, Owner `AppDialog` / Branch `Sheet` dual plane for count
  slips/assignments. No new policy — enforces Waves 1–3.
- **Wave 5 (list-first documents):** PO and GRN use the D1 Document tier.
  YCH and Transfer use the D2 fulfillment workflow with canonical DETAIL pages.
  The ratchet accepts each family’s single canonical address and rejects
  parallel implementations.

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

- Inventory sidebar lists `/inventory/purchase-orders` as **Đơn mua hàng**.
- `/inventory/supplier-invoices` redirects to `/finance/supplier-invoices` with
  query preserved.
- Sidebar keeps the short daily set; stocktake/count/waste/reports/AP stay off
  the sidebar leaves.
- Owner site filter admits all active `branch_kind` values; Branch Stock stays
  a separate plane (no Owner chrome).
- Dead path helpers (`receiving`, `expiry`) and temporary `/operations` shim
  stay out of new entrypoints after prune waves.
- SSOT sections agree on Record Depth and Overlay Decision.
