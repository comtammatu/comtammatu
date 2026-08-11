# ADR 0027 — Má Tư Design System rebuild (1A + 2A)

**Status:** Accepted (2026-08-09)

**Decision owner:** `docs/spec/design-system.md`

## Context

Structure audit on branch `ds-core` scored the UI stack at **10/12** (Critic-
adjusted; threshold ≥ 8). Debt included a mega-adapter (`surface.tsx`),
composites living in `packages/ui`, guard/prose bloat, naming duals
(`Owner*` / `Matu*` / Frame polysemy), Stitch mirror tax, and fragmented
`@theme` blocks — while Product Dual Thesis and Base UI a11y wrappers must stay.

## Decision

1. **Track `1A + 2A` only** — keep Má Tư brand (OKLCH, Dual Thesis density);
   **full Base UI** for headless behavior in `packages/ui` (no hybrid).
2. **One system name:** Má Tư Design System. No Custom Theme, Concept 01,
   Version badge, or Stitch / `.stitch/` mirror. Root `DESIGN.md` stays banned.
3. **One CSS entry:** `packages/ui/src/styles/globals.css` (no `ds.css`).
4. **Theme runtime stays in `packages/ui`** (`ThemeProvider` / `theme-script`);
   rename/dedupe cookie identifiers later — do not dual-ship themes.
5. **`Frame` law:** inset primitive only; `AppListFrame` / `DocumentFormFrame`
   remain legal `App*` adapters.
6. **Tear-down ordered:** P0 SSOT + globals consolidate + Base UI slider gap;
   P1 primitives-only package + dissolve `surface.tsx`; P2 copy convergence +
   `Owner*`/`Matu*` renames + guard slim. Full-system waves include POS/KDS.
7. **Preserve while tearing down:** Base UI a11y wrappers; safe-area utilities;
   Dual Thesis shells; confirm-dialog bus behavior until relocated; registry-
   held unused primitives until an explicit retire change set.
8. **Base UI exceptions (closed):** Sonner, DayPicker calendar, native date
   input, pagination composite. Slider migrates to Base UI.

## Consequences

- Docs and guards must not reintroduce Stitch or Custom Theme strings.
- Dev lab `/ds-lab` is an internal LANDING archetype; production 404s.
- Coordination notes under `docs/plan/ds-core/` are non-durable and must not
  remain in the tree; this ADR + SSOT own the decisions.

## Verification

`lint:ui-contract`, design-token contrast tests, DS primitive tests, and the
owner-shell scroll doc assertions (`data-control-surface-scroll`) must stay green
on the rebuild branch.
