# Design System - Com Tam Ma Tu Web App

> Version: 14.0.0 | Updated: 2026-04-25 | Status: locked baseline for UI/UX rebuild

## Decision

The design system is the current shadcn preset plus the runtime tokens and primitives that already exist in this repo. It is not a separate theme layer, not a new component library, and not a parallel visual language.

Active runtime:

- `style`: `radix-lyra`
- `preset`: `b6G3vbGue`
- `baseColor`: `neutral`
- `cssVariables`: `true`
- `iconLibrary`: `lucide`
- primitive base: Radix/shadcn

Agents must preserve this decision unless the task explicitly asks to change the design system itself.

## Authority Order

When sources disagree, use this order:

1. Runtime config: `apps/web/components.json`, `packages/ui/components.json`, `packages/ui/src/styles/globals.css`, `apps/web/app/layout.tsx`
2. Primitive source: `packages/ui/src/components/*`
3. This contract: `docs/spec/design-system.md`
4. Implementation guide: `docs/modules/ui.md`
5. Negative rules: `tasks/regressions.md`
6. Product copy and terminology: `docs/ref/glossary.md`, `packages/shared/src/labels/vi.ts`, and domain dictionaries

Do not invent a local exception when the contract is unclear. Pause and update the contract first.

## Product UX Thesis

Com Tam Ma Tu is an operational restaurant system. The UI should feel calm, fast, touch-safe, and business-specific.

- POS and KDS are frontline tools. The first viewport must expose the next safe action or live queue.
- Admin surfaces are dense management workspaces. They should prioritize tables, filters, forms, and review states over decorative summary chrome.
- Inventory surfaces are workflow-first. The user should see pending tasks, required documents, and exception states before secondary analytics.
- Employee surfaces are lightweight task portals. Keep them narrow, direct, and consistent with the shared shell.

The visual tone is neutral foundation, warm primary action, restrained borders, semantic status colors, and strong spacing discipline.

## Token Contract

Allowed token families:

- Surface: `background`, `foreground`, `card`, `popover`, `muted`, `accent`, `border`, `input`, `ring`
- Action: `primary`, `secondary`, `destructive`
- State: `success`, `warning`, `info`, `destructive`
- Data: `chart-1` through `chart-5`
- Navigation: `sidebar-*`
- Radius: preset radius tokens only
- Typography: runtime font variables from `apps/web/app/layout.tsx` and `packages/ui/src/styles/globals.css`

Rules:

- Use semantic Tailwind token classes (`bg-background`, `text-muted-foreground`, `border-border`, `bg-success`, etc.).
- Do not hardcode raw palette classes for status meaning (`amber`, `emerald`, `zinc`, etc.) when a semantic token exists.
- Do not add arbitrary dimensions such as `text-[10px]`, `w-[200px]`, or `h-[3rem]`.
- Do not add static inline styles for presentation.
- Do not add per-route `theme.css` files.
- Do not create one-off color ramps for a module.
- Do not scale typography with viewport width.
- Do not change primitive radius, color, focus, or disabled behavior from a page wrapper.

If a new token is truly needed, it must be added to `packages/ui/src/styles/globals.css`, documented here, and checked against `tasks/regressions.md`.

## Component Authority

The only shared primitive layer is `packages/ui/src/components/*`.

Default primitive mapping:

| Need | Use |
| --- | --- |
| command/action | `Button`, `ButtonGroup`, `Toggle`, `ToggleGroup` |
| state label | `Badge` |
| framed repeated item | `Card` |
| dense data | `Table` |
| segmented view | `Tabs` |
| form input | `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Switch`, `Slider` |
| dialog flow | `Dialog`, `AlertDialog`, `Sheet`, `Drawer` |
| empty/no result/error | `Empty` or approved wrappers around `Empty` |
| loading | `Spinner`, `Skeleton`, `Progress` |
| list row | `Item`, `ItemGroup` |
| search/filter shell | `InputGroup`, `Combobox` helpers where appropriate |
| route context | `Sidebar`, `Breadcrumb`, `Separator` |
| keyboard hint | `Kbd`, `KbdGroup` |
| transient feedback | `Sonner` |

Toast and durable notification behavior is specified in `docs/spec/toast-notification-system.md`.

Allowed app wrappers:

- Data adapters that fetch, map, or validate domain data.
- Layout wrappers that arrange primitives without changing the visual contract.
- Form wrappers in `apps/web/app/components/form/`.
- Domain wrappers that remove repetition while still rendering shadcn primitives.

Forbidden wrappers:

- Wrappers that restyle a primitive into a new visual system.
- Page-specific clones of `Button`, `Badge`, `Card`, `Table`, `Tabs`, `Input`, or `Select`.
- Compatibility shims for a removed design system.
- Helpers named like legacy `app-*` surface classes.

## Surface Contracts

### POS

- Mobile-first.
- Main area is menu/search and cart creation.
- Cart is only for creating a new order.
- After submit, mutations happen through order detail or order history flows.
- Session, table, and branch context must compact after selection.
- Payment/destructive flows require confirmation or safe recovery.

### KDS

- Live kitchen queue is the primary content.
- Station, status, and order type filters must be compact and immediately reversible.
- Urgency/status has one visual source of truth per ticket.
- Use semantic state tokens; dark operational mode must still come from shared tokens.
- Bump/complete actions need large touch targets and clear focus states.

### Admin

- Use the shared admin shell, sidebar, breadcrumb, page heading rhythm, table/list/detail forms, and empty states.
- Prefer filters plus table/list views over dashboard-card mosaics.
- Page summaries are allowed only when they help decide the next management action.
- CRUD dialogs use shared form helpers and Zod 4 schemas.

### Inventory

- Workflow-first: receiving, issuing, transfers, stocktake, supplier documents, and exceptions come before analytics.
- Keep procurement and inventory terms aligned with `docs/ref/glossary.md`.
- Dense tables are expected, but row actions and destructive actions must stay visually separated.

### Employee

- Keep the surface narrow and task-led.
- Do not turn `/employee` into a second admin shell.
- Use the same typography, tokens, and state vocabulary as admin/POS/KDS.

## Layout Patterns

- Mobile layout is the baseline. Desktop may add density and faster scanning, but not a different information architecture.
- Use standard spacing/radius utilities and primitives before custom layout code.
- Prefer one clear toolbar per workflow.
- Search, filters, counts, and bulk actions should live together.
- Empty, loading, error, and blocked states must use approved primitives or wrappers.
- Do not repeat the same workflow state in header, rail, sidebar, gate, and board.

## Copy Contract

- Internal UI copy is Vietnamese by default.
- Keep established acronyms: `POS`, `KDS`, `HQ`, `GRN`, `WAC`.
- Do not introduce new synonyms for business states or workflow objects.
- Before adding labels, check `docs/ref/glossary.md`, `packages/shared/src/labels/vi.ts`, and the relevant domain dictionary.
- Utility copy beats marketing copy on app surfaces.

## Rebuild Rules For Agents

Before any UI rebuild task:

1. Read `AGENTS.md`, this file, `docs/modules/ui.md`, `tasks/regressions.md`, and the relevant domain docs.
2. State the surface, primary user job, affected route family, and primitives to use.
3. Confirm whether the task is a visual refactor, UX flow change, copy change, or behavior change.
4. Keep each PR to one route family or one primitive rollout wave.
5. If the implementation needs a new pattern, update this contract before applying the pattern broadly.

Before marking a UI task complete:

- No fake primitives.
- No arbitrary Tailwind dimensions.
- No static presentation inline styles.
- No route-specific theme layer.
- No duplicated workflow state.
- No new vocabulary drift.
- Mobile first viewport still exposes the next action or live queue for POS/KDS.
- `pnpm typecheck && pnpm lint && pnpm build` passes before marking implementation complete.
