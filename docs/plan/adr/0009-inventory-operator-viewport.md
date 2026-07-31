# ADR 0009 — Inventory operator viewport & flow

**Status:** Parked (2026-07-09) — **UI not implemented**.\
**Revisit condition:** The Owner continues the Branch Stock deep-workflow cutover, or runtime QA at `390x844`, `768x1024`, and `1024x768` confirms that document scroll hides the CTA/filter.\
**Scope:** Branch operator Inventory (`/br/[branchId]/stock/**`) and the embed pattern from Owner-control Inventory.\
**Constraint sources:** `docs/agent/rules/ui.md`, `docs/spec/design-system.md`, `docs/modules/ui.md` (Inventory / EMBED-WRAPPER).

---

## 1. Short conclusion

Inventory operator is **not optimized as “one viewport + ScrollArea + Table body”**
not because primitives are missing, but because the **current contract intentionally
uses document scroll** (the whole page scrolls inside `h-dvh`) and most stock
screens are **EMBED-WRAPPER** surfaces embedding Owner-control Inventory.

The `ui.md` rule “first viewport = action/queue” applies strongly to **POS/KDS**
and does not force Inventory to hard-fit like POS. `ScrollArea` is almost absent
from stock; `DataTable` / `DocumentFormFrame` / `AppDetailFooter sticky` exist,
but **do not create a separate scroll pane**.

---

## 2. Current Inventory state

### Shared shell (constraint for every stock screen)

- `(operator)/layout.tsx`: `h-dvh overflow-hidden` → main `flex-1 overflow-y-auto` → `AppPage density="compact"` → `OperatorBottomNav`.
- One primary scroll is on **main**, not on a content pane.
- Bottom nav has fixed height; sticky footer uses `chrome-safe-bottom`.

### Screen-group map

| Screen group | Example route | Current pattern |
| --- | --- | --- |
| Landing | `/stock` | `BranchOperatorPage` + tile grid — short document scroll |
| Catalog landing | `/stock/catalog` | `ItemGroup` drill-down — document-scroll |
| Catalog list | categories / ingredients / units / … | Embed settings Owner control + `DataTable` — document-scroll |
| Document LIST | PO, GRN list, transfer, stocktake list, issues, returns | EMBED → `*PageContent` + `AppToolbar` + `DataTable` (mobile card) — **whole-page scroll**; table header **not sticky** |
| On-hand | `/stock/on-hand` | Embed `stock-client`: compact = `StockMobileGrid`/cards; desktop = `DataTable` — document scroll |
| Create/edit DOC | GRN new, PO new, transfer new, waste, production new | `DocumentFormFrame` (Owner control) or bare flex when `embedded` + sticky `AppDetailFooter` — **body remains document flow**, no `ScrollArea` |
| GRN receiving/review | `/stock/receive/[id]`, GRN draft review | `ItemGroup` cards + sticky `AppDetailFooter` — document scroll + bottom CTA |
| Count / assignments | `/stock/count`, count-slips, assignments | Staff-runtime / embed — list/sheet; count uses `ItemGroup`, sheet uses `overflow-y-auto` |
| Detail | PO / transfer / stocktake / issue `[id]` | Metadata + `DataTable` lines + `AppDetailFooter sticky={embedded}` — document-scroll |
| Reports | `/stock/reports` | Embed report — document-scroll |

### Available primitives versus Inventory usage

| Primitive | Role | Stock-operator usage |
| --- | --- | --- |
| `ScrollArea` (`packages/ui`) | Scroll pane with explicit height | Used heavily in POS / self-order / team / notifications; **almost none in stock** |
| `DataTable` | LIST/DETAIL chuẩn | Có — **không** tự sticky header, **không** tự fill chiều cao còn lại |
| `DocumentFormFrame` | Document header + body + footer | Yes — `scroll` defaults to `false`, **does not split a pane** |
| Gate `scrollarea-no-max-height-only` | Rejects `ScrollArea` with only `max-h-*` | Requires explicit height/flex ownership or lets the layout/`DataTable` own scrolling |

---

## 3. Cause

1. **There is no rule “Inventory = single viewport / no nested scroll / hard-fit”.**\
   `ui.md` / design-system emphasize first viewport for **POS/KDS**; Inventory is
   “workflow-first, dense tables, sticky CTA for DOC”.
2. **Archetypes lock the document model:** LIST = `AppPage` + toolbar +
   `DataTable`; DOC = `DocumentFormFrame` + sticky footer; EMBED = bare
   `flex flex-col gap-3` inside operator `AppPage` — **intentional document scroll**,
   not a pane.
3. **Architecture history:** one `PageContent` serves Owner control + Branch
   (`embedded`). Owner control is desktop management where long scroll is fine;
   Branch PWA inherits the same body, which feels “not viewport optimized” on phones.
4. **Primitives exist but Inventory has no standard viewport shell.** POS has
   `min-h-0 flex-1` + `ScrollArea`; Inventory has not migrated, and the ScrollArea
   gate is deliberately **cautious** about incorrect nested scroll.
5. **Some parts are already “good enough” under the old contract:** sticky
   receiving/GRN CTA, compact filters, and mobile cards. Friction is mainly
   **long lists plus headers/filters disappearing while scrolling**, not a total
   absence of CTA.

---

## 4. Proposed standard pattern

### Use a viewport-locked shell

Sticky header/filter + `min-h-0 flex-1` body + `ScrollArea` (or scrolling table
body); sticky footer **outside** the scroll:

- Manual-action documents: receiving, GRN review/create (many lines), count slip,
  stocktake counting, and transfer receive.
- Dense mobile LISTs with filters and long rows: on-hand, PO/GRN/transfer queues —
  **at minimum** sticky toolbar + scrolling body; desktop may keep document scroll
  when pagination is short.

### Keep document scroll

- Short `/stock` Landing, catalog index, and settings drill-down.
- Read-only DETAIL (metadata + history) when no quantity is being entered.
- Reports and short forms.

### Standardize primitives

1. One **OperatorViewportShell** adapter (or extend `DocumentFormFrame` when
   `embedded`: header / `ScrollArea` body / `AppDetailFooter`) — do not fork UI
   per route.
2. LIST: `DataTable` with optional sticky `TableHeader` **inside** a pane with
   definite height (not ambiguous `ScrollArea` + `max-h`).
3. Do not add `ScrollArea` everywhere; avoid **double scroll** (`main
   overflow-y-auto` + pane). When the viewport is locked, main must be
   `overflow-hidden` and only the body pane scrolls.

### When NOT to use

Short Landing; Sheet/Drawer overlays with their own scroll; 1–3-field forms; and
long document-style audit readers.

---

## 5. Prioritized roadmap

### Phase 1 — High ROI (floor stock operations)

`receive/[id]`, embedded GRN review/create, `count` / stocktake count, transfer receive — viewport shell + existing sticky CTA + `ScrollArea` / `min-h-0` body.

### Phase 2 — Daily LISTs

On-hand, PO list, GRN list, transfer/receive list, issues/waste approvals — sticky toolbar + pane list/`DataTable`; standardize the mobile card inside the pane.

### Phase 3 — Catalog, detail, and Owner-control parity

Catalog sublists and DETAIL lines; consider the same shell on `/inventory` desktop if one contract is desired; landing/catalog index keeps document scroll.

---

## 6. Risks / dependencies

- **Double scroll** if main keeps `overflow-y-auto` while the page locks the viewport.
- **Bottom nav + safe area** versus sticky `AppDetailFooter` / `chrome-safe-bottom` — CTA can be covered or padding duplicated.
- **PWA `h-dvh` / keyboard** on mobile when focusing a quantity field (GRN/count).
- **Shared EMBED + Owner control code:** shell changes must pass through the `embedded` branch without breaking Owner-control `xwide`.
- **`scrollarea-no-max-height-only` gate** and LIST/DOC archetypes — update the contract before broad hard-fitting.
- **ACL / tile matrix** does not block layout, but dense viewports must not push unauthorized actions below the fold.

---

## Summary

The lack of a viewport-locked ScrollArea/Table feels real in the PWA experience,
but it is **not a bug against the current rule** — Inventory follows **document
workflow + embedded Owner control**.

The next sensible step is to **define a viewport shell for manual-action
documents (Phase 1)**, then tighten LISTs; do not add `ScrollArea` broadly.

### Owner decisions required

1. Approve Phase 1 (viewport shell for manual-action documents) before coding?
2. Update the `ui.md` / design-system contract before Phase 1 to allow Inventory
   to use a viewport-locked shell for dense DOC/LIST surfaces?
3. Add Phases 2–3 to the backlog now, or ship Phase 1 and reassess?
