> ARCHIVED 2026-05-07 — UI rebuild folded into 05-MODULE-CATALOG.md (per module § page contracts)

# UI/UX Rebuild Plan

> Updated: 2026-04-22 | Status: planning baseline

## Goal

Rebuild the UI/UX without changing the product's design-system authority.

The rebuild should make daily operation faster, reduce visual drift between modules, and keep POS/KDS/Admin/Inventory/Employee surfaces on the same shadcn preset.

## Non-Negotiables

- Design system contract: `docs/spec/design-system.md`
- Markdown layout map: `docs/plan/ui-ux-markdown-layout-map.md`
- Page contracts: `docs/plan/ui-ux-page-contracts.md`
- UI implementation rules: `docs/modules/ui.md`
- Regression rules: `tasks/regressions.md`
- Copy and vocabulary: `docs/ref/glossary.md`
- Runtime preset: `apps/web/components.json`, `packages/ui/components.json`, `packages/ui/src/styles/globals.css`

No rebuild wave may introduce a parallel theme, fake primitive, route-specific visual system, or new vocabulary source.

## Visual Direction

- Operational, not decorative.
- Neutral base with warm primary action.
- Semantic state colors for success, warning, info, and destructive states.
- Dense but readable admin tables.
- Touch-safe POS/KDS actions.
- Compact context after branch/session/table/station selection.
- Vietnamese utility copy with stable business terms.

## Rebuild Waves

### Wave 0 - Lock Rules

Status: done in this planning pass.

Scope:

- Lock `docs/spec/design-system.md`.
- Link it from `AGENTS.md` and `docs/modules/ui.md`.
- Add regression guard for contract-first UI work.

Acceptance:

- Other agents know the read order before UI work.
- The active preset and runtime token source are explicit.
- The rebuild plan has clear wave boundaries.

### Wave 1 - Audit And Route Contracts

Scope:

- Use `docs/plan/ui-ux-markdown-layout-map.md` as the cross-module layout source before editing runtime UI.
- Refresh `docs/plan/ui-audit-map.md`.
- For each route family, define primary user job, main workflow state, current drift, and required primitives.
- Prioritize `P0`: POS, KDS, login.

Acceptance:

- Every target route has a one-page route contract before code changes.
- Every route family maps to one of the shared shells in the markdown layout map.
- Drift is classified as visual, UX flow, copy, or behavior.
- Work can be split into small PRs.

### Wave 2 - Primitive Rollout

Scope:

- Finish the remaining shadcn primitive rollout from `tasks/todo.md`.
- Target `Item`, `InputGroup`, `ButtonGroup`, `Combobox`, `Sidebar`, `Breadcrumb`, `Kbd`, and shortcut hints.
- Remove remaining raw controls that imitate primitives.

Acceptance:

- Repeated rows use `Item`/`ItemGroup` where appropriate.
- Search/filter shells use `InputGroup` or approved form helpers.
- Segmented actions use `ButtonGroup`, `ToggleGroup`, or `Tabs`.
- Sidebar and breadcrumb behavior is consistent in admin.

### Wave 3 - Frontline Surfaces

Scope:

- POS: reduce context chrome after session/table lock, keep cart focused on new order creation, improve order detail/history mutation path.
- KDS: queue-first board, compact filters, one source of truth for ticket urgency/status, stronger touch/focus states.
- Login: align typography, spacing, focus states, and error copy with the shared system.

Acceptance:

- Mobile first viewport shows the next action or live queue.
- No duplicated workflow state across header/sidebar/gate/board.
- No raw status color drift.
- Destructive or irreversible actions have confirmation or safe recovery.

### Wave 4 - Admin And Inventory

Scope:

- Admin: standardize page heading rhythm, table/filter/empty states, detail sheets, and CRUD dialogs.
- Settings: normalize form field layout, dialog sizing, validation states, and table actions.
- Inventory: make task queues, procurement documents, exception states, and stock workflows the first scan target.

Acceptance:

- Dense tables remain readable.
- Filters, counts, and bulk actions are grouped consistently.
- Inventory terminology matches the glossary.
- Form dialogs use shared form helpers.

### Wave 5 - Employee And Cross-Surface Polish

Scope:

- Employee portal: keep task-led and narrow; align with global tokens.
- Cross-surface copy cleanup.
- Accessibility sweep for focus, keyboard, touch target, reduced motion, and contrast.

Acceptance:

- No vocabulary drift.
- No ad-hoc empty/loading/error states.
- Keyboard hints match wired shortcuts.
- Desktop density does not create a different IA from mobile.

## Idea Backlog

- POS compact context bar after session/table lock.
- POS order history as the only post-submit mutation entry.
- KDS lane filters that collapse into a single reversible control group on mobile.
- Admin route header pattern: title, scope breadcrumb, primary action, search/filter row.
- Inventory exception queue: late GRN, mismatched supplier invoice, low stock, pending transfer.
- Shared document status badges for PO, GRN, supplier invoice, transfer, stocktake.
- Shared destructive action pattern: separated placement, confirm copy, recovery note.
- Mobile-first "next action" check for every operational route.

## Quality Gates

- `pnpm typecheck && pnpm lint && pnpm build`
- Visual/browser check for runtime UI changes.
- Route contract updated when workflow behavior changes.
- `docs/spec/design-system.md` updated before adding any new system-level pattern.
- `tasks/regressions.md` updated when a failure mode becomes reusable.
