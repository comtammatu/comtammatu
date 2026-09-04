# ADR 0009 — Inventory operator viewport & flow

**Status:** Parked — UI not implemented.

**Revisit when:** Owner continues Branch Stock deep-workflow cutover or runtime
QA at `390x844` / `768x1024` / `1024x768` confirms document-scroll loses
CTA/filter.

Runtime chrome: [`docs/spec/page-archetypes.md`](../../spec/page-archetypes.md).
This ADR owns the parked viewport-lock decision.

## Decision

Keep **document-scroll** for `/stock` landing, short catalogs, read DETAIL,
reports, and short forms.

Viewport-locked shell (sticky header/filter + body `min-h-0 flex-1` + sticky
footer) only after Owner signs off Phase 1 for manual operation slips
(receive, GRN embed, count, transfer receive). One adapter — do not fork per
route. Missing viewport lock is **not** a bug against current rules.

Do not ship the shell before Owner sign-off and a contract update in `ui.md` /
design-system.
