# ADR 0025 — Má Tư Design System rebuild (1A + 2A)

**Status:** Accepted

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

## P1 execution notes (2026-08-09)

- Dissolve `surface.tsx` into `apps/web/app/components/surface/*.tsx` with a
  thin `surface.tsx` re-export barrel (existing `@/components/surface` imports
  stay valid).
- Relocate `confirm-dialog`, `reason-confirm-dialog`, `chart`, `sidebar` from
  `packages/ui` into `apps/web/app/components/`; update imports + registry.
- Retire `resizable` / `tag-input` via delete + registry + primitives test.

## P2 execution notes (2026-08-09)

- Rename DOM scrollport to `data-control-surface-scroll`; drop
  `AppPageStickyChrome` and `InventoryListFrame` registry aliases.
- Rename `messages.owner` → `messages.controlSurface`; theme token identifiers
  lose `Matu*` prefix while cookie wire value stays `"matu-theme"`.
- UI block plane id in registry/audit: `"owner"` → `"control_surface"`.
- Component renames: `OwnerOverview` → `ControlSurfaceOverview`,
  `OwnerStockIngredientDetail` → `StockIngredientDetail`,
  `OwnerCheckoutApprovalsPage` → `CheckoutApprovalsPage`.
- Copy ladder: `packages/ui` consumes `@comtammatu/shared/messages` (`UI_VI`,
  `ACTIONS_VI`, `ERRORS_VI`) for primitive defaults; route/product copy stays
  in `apps/web/lib/messages/*`. Auth `RouteSurface: "owner"` is unchanged.
- Guard slim: audit route family id matches product plane; keep one advisory
  signal (`useIsMobile`) with reason; `lint:ui-contract` remains the SSOT for
  SIGNAL_GUARD_COVERAGE ↔ guard id mapping.

## Wave C execution notes (2026-08-09)

- POS (`station_chrome`) uses plane-correct `StationSection` (re-export of
  `AppSection` anatomy) plus `Frame` for non-section bordered regions;
  `AppEmptyState` remains allowed on station surfaces.
- Registry adds `pos-board` UI block (BOARD + station plane) and
  `StationSection` app adapter; exemplar
  `apps/web/app/(protected)/br/[branchId]/pos/session-gate.tsx`.
- Static guard: no file under `apps/web/app/(protected)/br/[branchId]/pos/`
  may import `AppSection` from `@/components/surface` or raw `Card` from
  `@comtammatu/ui/components/card`.

## Wave D execution notes (2026-08-09)

- KDS/Runner already compose `OperationalBoardCard` / station chrome without
  `AppSection` or raw `Card`; Wave D locks that with static guards and recipe
  metadata.
- Registry: `realtime-board` (KDS) Dual Thesis forbidden list; new
  `runner-board` block for `/br/[branchId]/runner`.
- Audit family fix: `/app/r/` is guest feedback QR (`public-feedback`), not
  runner station. Runner station remains `/br/[branchId]/runner` only.

## Wave E execution notes (2026-08-09)

- Employee staff-runtime already composes `EmployeePage` / `EmployeePanel`;
  Wave E locks Dual Thesis: no direct `AppSection`, `AppShell`, `AppListFrame`,
  or raw `Card` outside the Employee adapter file.
- Public/guest surfaces use plane-correct `PublicSection` (re-export of
  `AppSection` anatomy) for card sections; `AppPage` / `AppEmptyState` stay
  allowed as chrome-less adapters.
- Registry: `PublicSection` adapter; blocks `employee-self-service`,
  `public-feedback`; Dual Thesis updates for `public-transaction` and
  `system-gate`.

## Wave F execution notes (2026-08-09)

- Finance/inventory dense LIST/REPORT stay on `control_surface` with
  `AppListFrame` / `AppSection contentFlush` + `DataTable`; no plane adapter
  fork required.
- Retired dead aliases: `owner-module-contract.ts` (`OwnerModuleId` /
  `OWNER_MODULE_IDS`) and the `InventoryListFrame` filename leftover (filter
  constants live in `inventory-list-filters.ts` only).
- Registry `management-list` Dual Thesis: prefer `AppPage xwide/compact` +
  `AppListFrame`; forbid raw Card/Table and resurrected InventoryListFrame.
