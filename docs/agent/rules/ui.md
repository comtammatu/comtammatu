# UI Rules

Use this file before changing UI, UX, route surfaces, styling, frontend copy, shadcn components, or operational POS/KDS flows.

## Source Of Truth

- `docs/spec/design-system.md`
- `docs/modules/ui.md`
- `tasks/regressions.md`
- `apps/web/components.json`
- `packages/ui/components.json`

Reference baseline for rebuild and polish work:

- When the sibling repo is available locally, read `~/matu-superapp/DESIGN.md`, `~/matu-superapp/docs/spec/design-system.md`, `~/matu-superapp/docs/agent/rules/ui.md`, and `~/matu-superapp/docs/architecture/design-tokens-bridge.md` before POS/KDS/frontline UI rebuilds.
- Treat `~/matu-superapp` as the product-design precedent for Má Tư minimalist warm operations UI: semantic tokens, border-first surfaces, 8px card/control radius, 44px frontline touch targets, no route-specific theme, no decorative dashboard chrome, and POS/KDS first viewport exposing the next action or live queue.
- Treat its strongest lesson as the System Validity Rule: radius, border, shadow, margin, padding, gap, font size, font weight, icon size, control height, density, viewport behavior, and status vocabulary must all start from one shared foundation, then flow through primitives and approved surface adapters.
- Do not copy it blindly when this repo's runtime contract differs. Reconcile `docs/spec/design-system.md`, runtime primitives, and generated tokens first, then implement.

External references:

- Shadcn UI Docs: https://ui.shadcn.com/docs/
- Installation: https://ui.shadcn.com/docs/installation/
- Preset: https://ui.shadcn.com/create?preset=b6G3vbGue
- Components: https://ui.shadcn.com/docs/components/
- Preset command: `pnpm dlx shadcn@latest init --preset b6G3vbGue --template next --monorepo --base radix`

## Guardrails

- NEVER invent or redesign the UI outside the project's established design system.
- NEVER exceed authority when editing UI; only make UI changes explicitly requested or clearly required by the task.
- NEVER put agent notes, dev commit notes, implementation explanations, or internal commentary into user-facing UI.
- ALWAYS follow project UI rules and regressions before changing any interface.
- USE `shadcn/ui` components and the project's active preset as the default UI path.
- NEVER override the visual contract of core primitives through ad-hoc wrappers, custom themes, or parallel surface systems.
- NEVER treat geometry or typography as page-local decoration. If a screen needs a new radius, border, spacing, font-size, font-weight, icon size, height, density, or shadow role, update `docs/spec/design-system.md` and the shared primitive/adapter first.
- For shadcn `InputGroup`, render the input/textarea/custom control first in DOM order, then addons; use addon `align` for visual position. Choose height through `InputGroup size` (`sm`, `default`, `touch`, `touch-lg`), not route-local `h-*` overrides. Use `InputGroup` for search, clear, unit, currency, percent, scanner, or helper-action fields; keep plain/legal/date/long-note fields as normal `Field` + control composition.
- For shadcn `Button`, `ButtonGroup`, `Toggle`, and `ToggleGroup`, choose variant/size/spacing/shape props before adding visual Tailwind. POS/KDS choice tiles use `Button size="choice"`; positive completion actions use `Button variant="success"`; segmented state selectors use `ToggleGroup variant="segmented"` and `shape="flush"` only when attached to an edge.
- For shadcn `Checkbox`, `Switch`, and `Slider`, choose `size` (`sm`, `default`, `touch`) for hit target, track, and thumb geometry. Route code may provide alignment, label, or layout only; do not set dimensions, state color, or pseudo-element hit areas in caller classes.
- For shadcn `Tabs`, choose `TabsList variant` (`default`, `line`, `toolbar`, `pills`) and `size` (`sm`, `default`, `touch`) before styling triggers. Route code may set layout width/grid only; do not set tab height, trigger padding, active background, or radius in caller classes.
- For shadcn `Table`, choose `density` (`compact`, `default`, `comfortable`, `spacious`) for row/cell rhythm and `TableHead variant="eyebrow"` for uppercase metadata headers. Route code may set column width, alignment, responsive visibility, and row semantic state, not repeated cell padding or header typography.
- For shadcn `Badge`, choose `variant` and `size` (`sm`, `default`, `lg`) before adding classes. Do not recreate pill badges with `rounded-full px-* py-*`; use `size`.
- For shadcn `Field`, keep vertical as the mobile-first default. Use horizontal/responsive only for real compact setting rows or container-aware desktop layouts. Reusable form wrappers must connect `FieldDescription` / `FieldError` with `aria-describedby`, set `data-invalid` on `Field`, set `aria-invalid` on the control, and never force primitive heights with `h-10`, `!h-10`, or `min-h-24`.
- For shadcn `Select`, use `SelectTrigger size` (`xs`, `sm`, `default`, `touch`) instead of `h-*` classes. Use `Select` for finite choices; use combobox wrappers only for search/autocomplete, object matching, or multi-select. Combobox triggers compose `Button`, so their height comes from `Button size`, not `className`.
- For shadcn `NativeSelect`, use it deliberately for native mobile behavior, rows-per-page, compact toolbar filters, or fallback forms. Choose `size` (`xs`, `sm`, `default`, `touch`) and `width` (`fit`, `full`) instead of route-local height or select wrappers. Never use raw `<select>` in app surfaces.
- For shadcn `Command`/`Popover`, keep anchored popovers short and contextual; use `Dialog`/`Sheet`/`Drawer` for long or multi-step mobile flows. Use `PopoverContent width`/`padding`, `CommandList maxHeight`, and `CommandItem checked` instead of route-local width/padding/max-height/check-icon overrides.
- For shadcn `DropdownMenu`/`ContextMenu`/`Menubar`, use menu content `width`/`density` props instead of route-local width or item sizing classes. Use checkbox/radio items for toggles and exclusive choices, `variant="destructive"` for destructive actions, and let menu items own icon size/gap.
- For shadcn `NavigationMenu`, use it only for horizontal destination navigation, not tabs, sidebars, breadcrumbs, or POS/KDS rails. Use root `size` and content `width`; do not override trigger/content geometry in route classes.
- For shadcn `Pagination`, use link components for URL page changes and button components for client-state table pagination. Do not build previous/next rows from raw `Button` when the UI is pagination.
- For shadcn `Progress`, choose `size` (`xs`, `sm`, `default`, `lg`) for height and `tone` for semantic state. Do not set progress height, radius, background, or indicator color from route classes.
- For shadcn `RadioGroup`, choose `density` (`compact`, `default`, `touch`) for spacing and hit target. POS/KDS/frontline choice rows use `density="touch"` and a full-row clickable label or Field composition.
- For shadcn `Resizable`, use it only for desktop/tablet productivity layouts. Use `ResizableHandle size`; do not route-style handle width/grip geometry.
- For shadcn `ScrollArea`, use it for bounded panel/list scrolling. The primitive owns overflow clipping and scrollbar rendering; route code may provide layout bounds (`min-h-0`, `flex-1`, `max-h-*`) but not `overflow-hidden` or scrollbar/thumb styling.
- For shadcn `Dialog`/`AlertDialog`/`Sheet`/`Drawer`, choose by interaction weight: `AlertDialog` only for interrupt/destructive decisions, `Dialog` for short focused forms, `Sheet` for side/bottom companion workflows, and `Drawer` for mobile-first or responsive panels. Use `DialogContent size`/`padding`/`scroll`/`placement`, `SheetContent size`/`height`/`surface`/`scroll`, and `DrawerContent size`/`height`/`surface` instead of route-local modal geometry classes.
- USE `apps/web/app/components/surface.tsx` for repeated app-level page/header/section/toolbar/empty/link-card patterns. `apps/web/app/components/matu-surface.tsx` is compatibility/showcase only. Domain wrappers must delegate to the canonical adapter instead of cloning layout/chrome.
- BEFORE UI/UX rebuild work, read and follow `docs/spec/design-system.md` as the locked design-system contract.
- UI/UX rebuild PRs MUST state the surface, primary user job, route family, change type, and primitives used before implementation.

## Typography Rules

- Default matu-superapp typography is Be Vietnam Pro for body/content/headings/titles and JetBrains Mono for tabular operational data.
- Runtime source is `apps/web/app/layout.tsx` plus `packages/ui/src/styles/globals.css`; use `font-sans`, `font-heading`, `font-mono`, or `font-matu-body` instead of raw `font-family`.
- Static public UI artifacts such as `docs/status/index.html` must mirror the active runtime font stack they present.
- NEVER add route-specific fonts, extra Google font families, hardcoded fallback stacks, or new per-surface font variables outside the documented design-system contract.
- NEVER reintroduce Inter/Montserrat, Geist, system-only typography, or route-local font stacks unless the design-system contract is explicitly changed first.
- When changing typography, update `docs/spec/design-system.md`, `docs/modules/ui.md`, `tasks/regressions.md`, and runtime/static artifacts in the same change.

## Operational UI Philosophy

- Treat `/br/[branchId]/pos` and `/br/[branchId]/kds` as frontline operational surfaces, not dashboards.
- Mobile-first for operational routes: the first viewport must show the next safe action or the live queue, not decorative hero/status chrome.
- Once staff lock context such as session, table, station, or order, compact the UI and give space back to the primary task.
- One workflow state should have one visual source of truth. Do not repeat the same state in header, rail, sidebar, gate, and board.
- Cart is for creating a new order only. After submit, order mutations MUST happen from order detail or order history flows.
- Desktop may add density, secondary insight, or faster scan surfaces, but MUST NOT create a different IA from mobile.
- Prefer real shadcn primitives (`Tabs`, `Badge`, `Button`, `Card`, `Sheet`, `Select`, `Table`, `Dialog`) before styling raw `div` or `button` controls.
- Use a single vocabulary for the same workflow state across POS and KDS. Do not rename the same concept per surface.
- Keep destructive actions visually separated from primary actions and always require confirmation or a safe recovery path.

## Regression Rules To Recheck

Read `tasks/regressions.md` before UI work, especially:

- `DESIGN-SYSTEM-CONTRACT-FIRST`
- `NO-ARBITRARY-DIMENSIONS`
- `NO-SURFACE-THEME-IMPORTS`
- `NO-STATIC-UI-INLINE-STYLES`
- `TERMINOLOGY-SOURCE-OF-TRUTH`
- `PRESET-FIRST-UI`
- `NO-PRIMITIVE-DESIGN-OVERRIDE`
- `DOCS-MUST-MATCH-RUNTIME`
- `NO-LEGACY-APP-HELPERS`
- `NO-FAKE-PRIMITIVES`
- `APP-SURFACE-ADAPTER-FIRST`
