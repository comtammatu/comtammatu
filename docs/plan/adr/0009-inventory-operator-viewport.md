# ADR 0009 — Inventory operator viewport & flow

**Status:** Parked (2026-07-09) — **UI not implemented**.

**Revisit when:** Owner continues Branch Stock deep-workflow cutover or runtime QA
at `390x844` / `768x1024` / `1024x768` confirms document-scroll loses CTA/filter.

**Scope:** Branch operator Inventory (`/br/[branchId]/stock/**`) and embed patterns
from Owner control Inventory.

**Constraint sources:** `docs/agent/rules/ui.md`, `docs/spec/design-system.md`,
`docs/modules/ui.md` (Inventory / EMBED-WRAPPER).

## Context

Inventory operator feels "not viewport-optimized" because the contract **intentionally
uses document-scroll** (main `overflow-y-auto` inside shell `h-dvh`) and most stock
screens are **EMBED-WRAPPER** views of Owner control. The first-viewport rule in
`ui.md` applies strongly to POS/KDS, not hard-fit Inventory like POS. `ScrollArea`
barely appears on stock; `DataTable` / `DocumentFormFrame` /
sticky `AppDetailFooter` do not create a separate scroll pane.

## Decision

**Keep document-scroll** for landing `/stock`, short catalog indexes, read DETAIL,
reports, and short forms.

**Viewport-locked shell** (sticky header/filter + body `min-h-0 flex-1` +
`ScrollArea` or table body; sticky footer outside scroll) only after Owner signs off
Phase 1 for manual operation slips:

| Priority | Scope |
| --- | --- |
| Phase 1 | `receive/[id]`, GRN review/create embedded, count/stocktake count, transfer receive |
| Phase 2 | On-hand, PO/GRN/transfer queues — sticky toolbar + pane list |
| Phase 3 | Catalog sublists / DETAIL lines; optional Owner control parity |

Standardize through one adapter (`OperatorViewportShell` or `DocumentFormFrame`
when `embedded`) — do not fork per route. When viewport-locked: main
`overflow-hidden`, only the body pane scrolls (avoid double scroll). Do not attach
`ScrollArea` everywhere; respect gate `scrollarea-no-max-height-only`.

### Owner decisions still open

1. Sign off Phase 1 before coding?
2. Update `ui.md` / design-system contract (Inventory MAY viewport-lock for dense
   DOC/LIST) before Phase 1?
3. Queue Phase 2–3 immediately, or Phase 1 only then evaluate?

## Consequences

- Missing viewport lock **is not a bug** against current rules.
- Main migration risks: double scroll, bottom-nav vs sticky footer,
  keyboard on PWA, breaking Owner control `xwide` without an `embedded` branch.

## Verification

- Do not ship viewport shell before Owner signs off Phase 1 + contract update.
- Live LIST/DOC/EMBED archetypes: `docs/spec/design-system.md`,
  `docs/spec/page-archetypes.md`.
