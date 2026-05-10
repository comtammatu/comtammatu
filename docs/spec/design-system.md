# Design System - Com Tam Ma Tu Web App

> Version: 15.0.0 | Updated: 2026-05-09 | Status: matu-superapp baseline promoted app-wide

## Decision

The design system is the current shadcn preset plus the matu-superapp operational baseline promoted across the web app. It uses Má Tư semantic tokens, Be Vietnam Pro typography, shadcn/Radix primitives, Lucide icons, Vietnamese operational copy, border-first surfaces, and Apple-grade geometry discipline. It is not a separate ungoverned theme layer, not a new component library, and not a license to create per-route visual systems.

## System Validity Rule

A valid design system has one measurable foundation from token to primitive to pattern. Radius, border, shadow, margin, padding, gap, font size, font weight, icon size, control height, density, viewport behavior, and status vocabulary are system roles, not page-local taste.

Every UI change must preserve this chain:

- Token source defines the value family.
- Rhythm contract maps values to roles.
- Primitive or approved adapter owns the reusable implementation.
- Route code composes the primitive or adapter without overriding the visual contract.
- Drift checks in this document and `tasks/regressions.md` can verify the result.

If a component or pattern needs a value outside this contract, promote the new role into this document and the shared primitive/adapter first. Do not solve it once in a route with arbitrary Tailwind classes, inline styles, wrapper-specific CSS, or a route-specific theme file.

Active runtime:

- `style`: `radix-lyra`
- `preset`: `b6G3vbGue`
- `baseColor`: `neutral`
- `cssVariables`: `true`
- `iconLibrary`: `lucide`
- primitive base: Radix/shadcn
- brand concept: Ma Tu Concept 01
- brand assets: `/brand/logo-matu.png`, `/brand/logo-matu-seal.png`, `/brand/logo-matu-vertical.png`
- web brand primitive: `apps/web/app/components/brand.tsx`
- web app surface adapters: `apps/web/app/components/surface.tsx`
- Design tokens: `packages/design-tokens/tokens.json` → `packages/ui/src/styles/matu-tokens.css`
- Web app surface adapters: `apps/web/app/components/surface.tsx`
- Compatibility surface showcase: `apps/web/app/components/matu-surface.tsx`
- App font: Be Vietnam Pro through `font-sans`, `font-heading`, and `font-matu-body`

Agents must preserve this decision unless the task explicitly asks to change the design system itself.

## Authority Order

When sources disagree, use this order:

1. Runtime config: `apps/web/components.json`, `packages/ui/components.json`, `packages/ui/src/styles/globals.css`, `packages/ui/src/styles/matu-tokens.css`, `apps/web/app/layout.tsx`
2. Primitive source: `packages/ui/src/components/*`
3. Generated token source: `packages/design-tokens/tokens.json`
4. This contract: `docs/spec/design-system.md`
5. Implementation guide: `docs/modules/ui.md`
6. Negative rules: `tasks/regressions.md`
7. Product copy and terminology: `docs/ref/glossary.md`, `packages/shared/src/labels/vi.ts`, and domain dictionaries

Do not invent a local exception when the contract is unclear. Pause and update the contract first.

## Product UX Thesis

Com Tam Ma Tu is an operational restaurant system. The UI should feel calm, fast, touch-safe, and business-specific.

- POS and KDS are frontline tools. The first viewport must expose the next safe action or live queue.
- Admin surfaces are dense management workspaces. They should prioritize tables, filters, forms, and review states over decorative summary chrome.
- Inventory surfaces are workflow-first. The user should see pending tasks, required documents, and exception states before secondary analytics.
- Employee surfaces are lightweight task portals. Keep them narrow, direct, and consistent with the shared shell.

The visual tone is rice-cream foundation, terracotta primary action, deep navy text, warm rice-yellow accents, restrained borders, semantic status colors, and strong spacing discipline.

## Token Contract

Allowed token families:

- Surface: `background`, `foreground`, `card`, `popover`, `muted`, `accent`, `border`, `input`, `ring`
- Action: `primary`, `secondary`, `destructive`
- State: `success`, `warning`, `info`, `destructive`
- Data: `chart-1` through `chart-5`
- Navigation: `sidebar-*`
- Radius: preset radius tokens only
- Typography: runtime font variables from `apps/web/app/layout.tsx` and `packages/ui/src/styles/globals.css`
- Generated `matu-*` colors, spacing, radius, shadow, and touch-target tokens from `packages/design-tokens/tokens.json`; use directly only when a semantic token class is not expressive enough. Route code should prefer semantic classes such as `bg-background`, `text-foreground`, and `border-border`.

The token contract covers value families. The rhythm and component contracts below decide which value is allowed for each role. A raw value that happens to match a token is still invalid when it bypasses the owning primitive or adapter.

Brand Concept 01 runtime mapping:

- `background`: kem gao foundation.
- `foreground`: xanh dam.
- `primary`: do gach.
- `ring` / chart accent: vang gao.
- `success`: xanh la diu.
- `muted-foreground` / supporting tone: nau go or xam am depending on theme.
- Heading font: Be Vietnam Pro.
- Body font: Be Vietnam Pro.
- Mono font: JetBrains Mono for tabular operational data.

## Typography Contract

Runtime typography source:

- `apps/web/app/layout.tsx` loads `Be_Vietnam_Pro` and `JetBrains_Mono` through `next/font/google`.
- `packages/ui/src/styles/globals.css` maps those font variables into Tailwind utilities.
- `docs/status/index.html` is a static public artifact and must mirror the runtime font stack it presents with local CSS variables.

Required utility mapping:

| Purpose             | Utility / variable                    | Font           |
| ------------------- | ------------------------------------- | -------------- |
| body/content text   | `font-sans` / `--font-sans`           | Be Vietnam Pro |
| headings/titles     | `font-heading` / `--font-heading`     | Be Vietnam Pro |
| operational data    | `font-mono` / `--font-mono`           | JetBrains Mono |
| explicit Má Tư body | `font-matu-body` / `--font-matu-body` | Be Vietnam Pro |

Rules:

- Route/page headings, card titles, dialog titles, sheet titles, section titles, and brand lockup text use `font-heading` unless a shadcn primitive already applies it.
- Body text, controls, labels, descriptions, table text, and workflow copy inherit `font-sans`.
- Use `font-mono` only for tabular operational data, IDs, codes, receipt/order numbers, prices, quantities, timestamps, and audit hashes.
- Do not add route-specific `font-family`, custom font variables, or extra Google font families.
- Be Vietnam Pro is the app-wide default; do not add route-specific font families or reintroduce Inter/Montserrat exceptions unless this contract is explicitly changed first.
- Do not introduce Geist, system-only stacks, or per-surface typography exceptions unless the design-system contract is explicitly changed first.
- When changing typography runtime, update `apps/web/app/layout.tsx`, `packages/ui/src/styles/globals.css`, this contract, `docs/modules/ui.md`, `docs/agent/rules/ui.md`, `tasks/regressions.md`, and any public static artifact that renders the UI brand such as `docs/status/index.html`.

Rules:

- Use semantic Tailwind token classes (`bg-background`, `text-muted-foreground`, `border-border`, `bg-success`, etc.).
- Prefer semantic token classes; use generated `matu-*` token classes for explicit brand-token demos, visual QA surfaces, or approved token-level implementation work.
- Use `BrandMark` / `BrandLockup` for web runtime logo rendering; do not reference `/brand/logo-*` directly from route components.
- Do not hardcode raw palette classes for status meaning (`amber`, `emerald`, `zinc`, etc.) when a semantic token exists.
- Do not add arbitrary dimensions such as `text-[10px]`, `w-[200px]`, or `h-[3rem]`.
- Do not add static inline styles for presentation.
- Do not add per-route `theme.css` files.
- Do not create one-off color ramps for a module.
- Do not scale typography with viewport width.
- Do not change primitive radius, color, focus, or disabled behavior from a page wrapper.

If a new token is truly needed, it must be added to `packages/ui/src/styles/globals.css`, documented here, and checked against `tasks/regressions.md`.

## Rhythm Contract

Token Contract locks **what** values exist; Rhythm Contract locks **when** to use which value, so spacing, sizing, and density read consistently across modules instead of being a per-module judgment call.

A module that needs to deviate must update this contract first, not patch a single page.

### A. Spacing Rhythm

| Slot                         | Class                                | Notes                                 |
| ---------------------------- | ------------------------------------ | ------------------------------------- |
| Page outer padding (compact) | `p-4 md:p-5`                         | Set by `AppPage` density="compact"    |
| Page outer padding (default) | `p-4 md:p-6 2xl:p-8`                 | Set by `AppPage` default              |
| Card inner (default)         | `p-4`                                | Set by `Card` primitive               |
| Card inner (size="sm")       | `p-3`                                | Set by `Card data-size=sm`            |
| Toolbar inner                | `p-3`                                | Set by `AppToolbar`                   |
| Section vertical gap         | `gap-6` (default), `gap-4` (compact) | Set by `AppPage`                      |
| Within-section element gap   | `gap-2`                              | Default for inline rows / form fields |
| Compact toolbar chip gap     | `gap-1.5`                            | Filter chips, badge clusters          |
| Tight icon-label gap         | `gap-1`                              | Icon + 1–2 word label only            |

Allowed gap scale in app code: `1`, `1.5`, `2`, `3`, `4`, `6`. Avoid `5`, `7`, `8` for horizontal flow — they break vertical rhythm with the heading scale below.

Page padding MUST come from `AppPage` rather than ad-hoc page roots. Card padding MUST come from `Card` / `Card size="sm"` rather than ad-hoc `<CardContent>` overrides.

### B. Heading Scale (locked per role)

| Role                    | Class                                            | Source                            |
| ----------------------- | ------------------------------------------------ | --------------------------------- |
| Page H1                 | `font-heading text-xl sm:text-2xl font-semibold` | `AppPageHeader`                   |
| Section title           | `font-heading text-base font-semibold`           | `CardTitle`                       |
| Sub-section / list head | `font-heading text-sm font-semibold`             | `Item title` slot                 |
| Eyebrow / metadata      | `text-xs font-medium uppercase tracking-wide`    | `AppPageHeader.eyebrow`           |
| Dense eyebrow           | `text-2xs font-medium uppercase tracking-wide`   | KDS chrome, audit row meta        |
| Numeric input echo      | `text-3xl font-semibold tabular-nums`            | Number pad readout, scale display |

`text-4xl`, `text-5xl` are NOT allowed in app surfaces. They live only in marketing/login splash. `text-3xl` is reserved for the numeric-input-echo role above (cashier number pad, scale display) and MUST be paired with `tabular-nums`. `text-3xs` is reserved for SVG axis labels and dense table micro-meta.

`font-bold` only for receipt totals, page headers in print mode, and emphasis inside body copy. Default heading weight is `font-semibold`. `font-black` is not allowed in the app.

### C. Icon Size by Role

| Slot                                | Class                                                            |
| ----------------------------------- | ---------------------------------------------------------------- |
| Inline badge / chip glyph           | `size-3`                                                         |
| Button `size="sm"` glyph            | `size-3.5`                                                       |
| Default (button, link, input affix) | `size-4`                                                         |
| Section / card title glyph          | `size-5`                                                         |
| Page-header eyebrow glyph           | `size-6`                                                         |
| Empty-state media                   | `size-8`–`size-12` (via `EmptyMedia variant="icon"`)             |
| Image / document thumbnail          | `size-12`–`size-16` with `object-cover` (img preview, not glyph) |

`size-7`, `size-9`, `size-11` are NOT allowed in app surfaces. `size-14`, `size-16` are NOT allowed outside `EmptyMedia`, brand lockup, splash imagery, or image/document thumbnails (photo upload preview, supplier doc thumbnail, GRN evidence). Inventory/POS hero glyphs MUST compose `EmptyMedia` or render through a primitive, not free-style `size-12` inside a card.

### D. Height Scale (lock to primitive)

`Button` is the single source of truth for button height. Variants follow the matu-superapp 40px default / 44px frontline minimum:

| Variant    | Min height | When                                                                                  |
| ---------- | ---------- | ------------------------------------------------------------------------------------- |
| `xs`       | `h-7`      | Inline metadata actions, tag pickers                                                  |
| `sm`       | `h-8`      | Compact table action, dense toolbars, dialog footers                                  |
| `default`  | `h-10`     | Standard CTA, form submit                                                             |
| `lg`       | `h-11`     | Primary CTA, page-header action                                                       |
| `touch`    | `min-h-11` | Mobile touch button (POS, KDS, mobile inventory) — meets Apple HIG / WCAG 44px target |
| `touch-lg` | `min-h-14` | Hero CTA / mobile action bar primary (POS bottom bar, KDS bump)                       |
| `choice`   | `h-20`     | Two-line/icon choice tile such as POS payment method                                  |
| `icon-xs`  | `size-7`   | Icon-only inline                                                                      |
| `icon-sm`  | `size-8`   | Icon-only compact                                                                     |
| `icon`     | `size-10`  | Icon-only default                                                                     |
| `icon-lg`  | `size-11`  | Icon-only large / 44px touch target                                                   |

`Button variant="success"` owns positive completion actions such as POS/KDS served/done. Do not restyle a default button with `bg-success`.

`Toggle` / `ToggleGroup` share the same size vocabulary for segmented actions, including `touch` and `touch-lg`. Use `variant="segmented"` for exclusive state selectors that need the active item to read as primary. Use `shape="flush"` only when the segmented control is physically attached to a panel edge.

Fixed heights `h-10`, `h-11`, `h-12`, `h-14`, `h-16` MUST NOT be applied in route code to `<button>`, `<Link>`, or `<Button>` acting as a button; those heights belong in the primitive variants above. Min-heights `min-h-11`, `min-h-12`, `min-h-14`, `min-h-16` MUST come from the `touch` / `touch-lg` variants — do not override on a different variant via `className`. Touch CTAs use `min-h-` rather than fixed `h-` so wrapped labels grow vertically without clipping.

If a new touch tier is genuinely needed (e.g. tablet KDS oversized chef glove targets), add a variant to `Button` cva once. Never fake a button by setting `<button className="min-h-12 ...">` outside the primitive.

`Input`, `SelectTrigger`, `NativeSelect`, and `InputGroup` default to `h-10`; compact variants use `h-8`; frontline variants use at least `min-h-11`. `SelectTrigger size="xs"` is reserved for dense table-cell or inline metadata selectors. `Textarea` defaults to `min-h-24`. Vertical chrome should be controlled with `Field` / `FieldGroup` spacing, not by overriding input height.

`Checkbox`, `Switch`, and `Slider` own control hit-target sizing through their `size` props. Use `size="touch"` on POS/KDS/frontline or mobile rows where the control is a direct tap target. Route code may align the control inside a row (`mt-*`, `self-*`) but must not set checkbox dimensions, switch track/thumb geometry, or slider track/thumb sizes by class.

### InputGroup Contract

`InputGroup` is the sanctioned shadcn shell for fields that need an inline affordance: search icon, clear action, unit suffix, currency/percent prefix, barcode/scanner affordance, or a compact helper action. It is not the default wrapper for every field.

Use standalone `Field` + `Input`, `Textarea`, `Select`, or `NativeSelect` when the field is plain text, a legal/business identity value, a date/time selector, a long note, or a control whose clarity depends on label/error spacing rather than inline chrome.

Size is owned by the primitive:

| Variant    | Height     | When                                                    |
| ---------- | ---------- | ------------------------------------------------------- |
| `sm`       | `h-8`      | command menus, dense filters, compact table toolbars    |
| `default`  | `h-10`     | standard search/filter/affix input                      |
| `touch`    | `min-h-11` | mobile/touch inventory, POS, KDS controls               |
| `touch-lg` | `min-h-14` | rare frontline scanner / primary numeric-entry contexts |

Do not set `h-10`, `h-12`, or `h-8!` on `InputGroup` callers. Use `size`.

Follow the shadcn focus/navigation order: render `InputGroupInput`, `InputGroupTextarea`, or a custom control with `data-slot="input-group-control"` first in DOM order, then render `InputGroupAddon` elements. Use each addon's `align` prop for visual position.

Mobile space optimization is valid when it removes repeated labels/icons while preserving a 44px touch target and clear error/description placement. It is invalid when it hides meaning, compresses unrelated controls into one row, or turns a normal form into decorative density.

### Field Contract

`Field` is the required shell for reusable app form wrappers. It owns label, description, error, disabled/invalid state, and orientation. The control inside the field owns its own height through the primitive (`Input`, `Textarea`, `SelectTrigger`, `Button`, `InputGroup`), not through the form wrapper.

Rules:

- Use vertical `Field` by default; it is the mobile-first layout.
- Use `orientation="horizontal"` only for checkbox, switch, radio, or short binary settings where label and control form one compact row.
- Use `orientation="responsive"` for forms that should stay vertical on mobile and become horizontal inside a container-aware parent.
- Use `FieldSet` + `FieldLegend` for semantic groups of related controls, not just visual headings.
- `FieldGroup` owns vertical form rhythm. Do not shrink a form by lowering control height; choose `FieldGroup` spacing only when the whole form surface is intentionally compact.
- Invalid controls must set `data-invalid` on `Field`, `aria-invalid` on the actual control, and connect description/error text through `aria-describedby`.
- Required fields show the existing visual required marker and set `aria-required`; native `required` validation is opt-in per form, not a default side effect of shared wrappers.

Reusable wrappers under `apps/web/app/components/form/` must not apply primitive height classes such as `h-10`, `!h-10`, or `min-h-24`. Those values belong to the shared primitive source.

### Select And Combobox Contract

Use `Select` when the choices are known, finite, and do not require text search. Use `NativeSelect` when native browser behavior is more valuable than custom menu styling: mobile/frontline pickers, rows-per-page controls, very small toolbar filters, or low-risk fallback forms. Use combobox patterns (`ComboboxField`, `Combobox`, `MultiSelectCombobox`, or a documented domain wrapper) when the user needs search/autocomplete, multi-select, or object matching beyond the visible label.

`SelectTrigger` and `NativeSelect` size are owned by the primitive:

| Variant   | Height     | When                                      |
| --------- | ---------- | ----------------------------------------- |
| `xs`      | `h-7`      | dense table-cell selectors, inline badges |
| `sm`      | `h-8`      | compact toolbars, editable table rows     |
| `default` | `h-10`     | normal forms and filters                  |
| `touch`   | `min-h-11` | mobile/frontline selectors                |

Route code must not set `h-7`, `h-8`, `h-9`, `h-10`, or `min-h-*` directly on `SelectTrigger`, `NativeSelect`, or combobox trigger buttons. Choose the size prop and keep route classes to width, overflow, alignment, and semantic color. `NativeSelect width` is `fit` by default and `full` for form rows.

Combobox triggers compose `Button`; their height also comes from `Button size`, not from `className`. The popup content should use `Command` for search and list behavior, or the shadcn Combobox primitive if/when the project adopts it globally. Do not replace a short finite select with a combobox just because it looks richer; searchable controls cost more focus and typing effort on mobile.

### Command And Popover Contract

Use `Command` for searchable action lists, quick-pick dialogs, and combobox popup lists. Do not use it as a generic list, table, or navigation surface. Follow the shadcn composition: `CommandInput` first, then `CommandList`, then `CommandEmpty` / `CommandGroup` / `CommandItem`.

`Popover` is for short contextual content anchored to a trigger. If the interaction needs a long form, multi-step confirmation, destructive decision, or a mobile flow that should occupy the screen, use `Dialog`, `AlertDialog`, `Sheet`, or `Drawer` instead.

Popover geometry is owned by `PopoverContent` props:

| Prop      | Values                                       | When                                             |
| --------- | -------------------------------------------- | ------------------------------------------------ |
| `width`   | `default`, `trigger`, `auto`, `notification` | default panels, comboboxes, calendars, bell tray |
| `padding` | `default`, `compact`, `none`                 | rich panels, dense panels, embedded primitives   |

Route code must not set popover width, padding, or gap with `className` or inline `style`. Use `width` and `padding` instead. Combobox popovers use `width="trigger"` and `padding="none"` so the popup tracks the trigger and lets `Command` own internal spacing.

Command list height is owned by `CommandList maxHeight` (`sm`, `default`, `lg`, `xl`, `none`). Route code must not set `max-h-*` on `CommandList`. Selection checkmarks belong to `CommandItem checked`; callers should not draw a second trailing check icon for the same selected state.

### Dropdown, Context Menu, Menubar Contract

Use `DropdownMenu` for explicit action menus opened by a visible trigger. Use `ContextMenu` only for secondary right-click / long-press actions where the same command remains available through a visible control. Use `Menubar` only for persistent desktop-style command sets; do not use it as mobile navigation or a tab substitute.

Menu content geometry is owned by content props:

| Component                                      | Prop      | Values                         | When                                      |
| ---------------------------------------------- | --------- | ------------------------------ | ----------------------------------------- |
| `DropdownMenuContent`                          | `width`   | `trigger`, `default`, `action` | trigger-matched, natural, action menu     |
| `DropdownMenuContent`                          | `density` | `compact`, `default`, `touch`  | table/admin, normal, frontline touch menu |
| `DropdownMenuSubContent`                       | `width`   | `trigger`, `default`, `action` | submenu width                             |
| `DropdownMenuSubContent`                       | `density` | `compact`, `default`, `touch`  | inherited by default, override if needed  |
| `ContextMenuContent` / `ContextMenuSubContent` | `width`   | `default`, `action`            | natural or action menu                    |
| `ContextMenuContent` / `ContextMenuSubContent` | `density` | `compact`, `default`, `touch`  | table/admin, normal, touch surface        |
| `MenubarContent` / `MenubarSubContent`         | `width`   | `default`, `action`            | natural or action menu                    |
| `MenubarContent` / `MenubarSubContent`         | `density` | `compact`, `default`, `touch`  | dense desktop or touch surface            |

Use checkbox/radio menu items for toggle and exclusive-choice state instead of plain items with `data-active`. Use `variant="destructive"` for destructive or irreversible menu actions instead of route-local `text-destructive` classes. Menu item icons inherit size and gap from the primitive; callers should render `<Icon />` without `mr-*` or `size-*` inside menu items.

Route code must not set menu content width, padding, max-height, background, shadow, ring, radius, item height, item typography, destructive color, or item icon spacing directly on menu components. Choose the primitive props and variants above.

### Native Select, Navigation Menu, Pagination Contract

Use `NativeSelect` for native mobile dropdown behavior, browser performance, or compact system pickers such as rows-per-page. Use `Select` when the menu needs custom styling, rich trigger content, or Radix positioning. Do not use `NativeSelect` as a searchable picker; move to combobox when typing/search is part of the job.

Use `NavigationMenu` only for horizontal top-level navigation where users are choosing destinations. It is not a substitute for `Sidebar`, `Tabs`, `Breadcrumb`, or POS/KDS operational rails. `NavigationMenu size` (`sm`, `default`, `touch`) controls trigger and link height; `NavigationMenuContent width` (`auto`, `panel`, `wide`) controls panel width.

Use `PaginationLink` / `PaginationPrevious` / `PaginationNext` for URL navigation. Use `PaginationButton` / `PaginationPreviousButton` / `PaginationNextButton` for client-state pagination such as TanStack tables. Page controls must remain inside `Pagination` → `PaginationContent` → `PaginationItem`, and current page text uses `PaginationStatus`.

Route code must not build pagination by hand with raw `Button` rows for previous/next, must not use raw `<select>` in app surfaces, and must not set `NavigationMenu` trigger/content height, radius, padding, or panel width through route-local classes. Choose primitive props instead.

### Tabs, Table, Badge Contract

Use `Tabs` for segmented views where all panes share one route/job. Do not use `Tabs` as global navigation or as a visual replacement for `ToggleGroup`. `TabsList variant` owns tab chrome:

| Variant   | When                                                  |
| --------- | ----------------------------------------------------- |
| `default` | compact contained tabs                                |
| `line`    | low-chrome section tabs                               |
| `toolbar` | scrollable filter/workspace tabs inside toolbar rows  |
| `pills`   | standalone horizontal chips, especially POS category tabs |

`TabsList size` (`sm`, `default`, `touch`) owns trigger height/padding. Route code may set layout width/grid only, not tab height, active background, radius, or trigger padding.

Use `Table density` for row rhythm: `compact` for dense ledger/admin rows, `default` for normal data tables, `comfortable` for readable management tables, and `spacious` for detail/readout tables. `TableHead variant="eyebrow"` owns uppercase metadata headers. Route code may set column width, alignment, visibility breakpoints, and semantic row state; it must not repeat cell padding or header typography.

Use `Badge size` (`sm`, `default`, `lg`) for chip geometry. Badge variants own semantic color. Route code may set placement/layout (`absolute`, `shrink-0`, `ml-*`) and domain-specific tone only when a shared semantic variant does not exist; it must not recreate pill padding/radius on each badge.

### Progress, Radio Group, Resizable, Scroll Area Contract

Use `Progress` only for task completion, quota, distribution, or bounded metric progress. `Progress size` owns bar height:

| Variant   | Height  | When                                |
| --------- | ------- | ----------------------------------- |
| `xs`      | `h-1`   | tiny inline meter                   |
| `sm`      | `h-1.5` | compact metric rows                 |
| `default` | `h-2`   | normal progress and workflow step   |
| `lg`      | `h-3`   | large readout in focused task panes |

Use `Progress tone` (`default`, `success`, `warning`, `destructive`) for semantic state only. Route code may set layout width such as `max-w-*` or `flex-1`, but must not set progress height, radius, background, or indicator color through `className`.

Use `RadioGroup` for one-of-many choices where all options should remain visible. Use `RadioGroup density` (`compact`, `default`, `touch`) for spacing and hit target. POS/KDS/frontline choice rows use `density="touch"`. Compose radio options with `Label`, `Field`, or a full-row clickable label; do not make users tap only the small circle on touch surfaces.

Use `ResizablePanelGroup` only for desktop/tablet productivity layouts where resizing improves repeated work. It is not a mobile layout primitive. `ResizableHandle size` (`sm`, `default`, `touch`) owns the resize target and visible grip. Panels must keep `min-h-0` / `min-w-0` chains so nested scroll areas do not force overflow.

Use `ScrollArea` for bounded vertical lists, panels, and notification trays. Horizontal data tables keep using `Table` or plain `overflow-x-auto` wrappers. `ScrollArea scrollbar` (`vertical`, `horizontal`, `both`) and `scrollbarSize` (`sm`, `default`, `touch`) own scrollbar rendering; route code may set layout bounds (`min-h-0`, `flex-1`, `max-h-*`) but must not set `overflow-hidden`, scrollbar width, or thumb styling on `ScrollArea`.

### Dialog, Sheet, Drawer Contract

Use `Dialog` for short modal forms or focused content that should make the background inert. Use `AlertDialog` only when the user is interrupted for an important response, especially destructive or irreversible actions. Use `Sheet` for side or bottom workflows that complement the current screen. Use `Drawer` for mobile-first panels and responsive dialog/drawer patterns.

Dialog geometry is owned by `DialogContent` props:

| Prop        | Values                                      | When                                      |
| ----------- | ------------------------------------------- | ----------------------------------------- |
| `size`      | `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`, `5xl` | form width and dense operational panels   |
| `padding`   | `default`, `compact`, `none`                | normal modal, dense modal, embedded shell |
| `scroll`    | `auto`, `hidden`                            | normal content or command-style content   |
| `placement` | `center`, `command`                         | regular modal or command palette          |

Sheet geometry is owned by `SheetContent` props:

| Prop      | Values                                                     | When                                      |
| --------- | ---------------------------------------------------------- | ----------------------------------------- |
| `size`    | `sm`, `md`, `lg`, `xl`, `2xl`, `full`                      | side-sheet width                          |
| `height`  | `auto`, `viewport`, `viewport-80`, `viewport-95`, `screen` | bottom/top sheet height                   |
| `surface` | `popover`, `background`                                    | default panel or full-screen task surface |
| `scroll`  | `visible`, `auto`, `hidden`                                | content flow ownership                    |

Drawer geometry is owned by `DrawerContent` props:

| Prop      | Values                                | When                                     |
| --------- | ------------------------------------- | ---------------------------------------- |
| `size`    | `sm`, `md`, `lg`, `full`              | drawer width                             |
| `height`  | `auto`, `screen`, `desktopScreen`     | bottom drawer height                     |
| `surface` | `popover`, `background`, `responsive` | card-like, full-screen, responsive shell |

Route code must not set modal content width, max-height, viewport height, padding reset, background surface, or drawer pseudo-surface classes directly on `DialogContent`, `SheetContent`, or `DrawerContent`. Choose the primitive props above. Header/footer padding, borders, and sticky behavior may remain local only when they express a real workflow structure, such as a POS action sheet or a long scrollable form with persistent actions.

### E. Radius Scale (4 tokens only)

| Token          | When                                                         |
| -------------- | ------------------------------------------------------------ |
| `rounded-md`   | Default for input, button, badge, chip, and Card primitive   |
| `rounded-lg`   | Larger framed primitives such as sheet, dialog, drawer outer |
| `rounded-full` | Avatar, pill badge, circular icon container                  |
| `rounded-none` | Explicit reset only (table cell internals, edge-bleed media) |

`rounded` (no suffix), `rounded-sm`, `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-4xl` are NOT allowed in app code. The radius primitive token surface (`--radius-sm/md/lg/xl/2xl/3xl/4xl`) exists in `globals.css` for shadcn primitive compatibility — app surfaces consume them indirectly through Card/Sheet/etc., not directly.

### F. Density Modes

`AppPage density="compact"` and `Card size="sm"` are the two switches that move a surface from default to dense without rewriting spacing. POS/KDS/Inventory dense list views compose these. Per-module density classes (`*-dense`, `*-tight`) are not allowed.

## Component Authority

The only shared primitive layer is `packages/ui/src/components/*`.

App-level page, section, toolbar, empty-state, and link-card composition is centralized in `apps/web/app/components/surface.tsx`. These exports are adapters around the shared primitives, not a second primitive library.

`apps/web/app/components/matu-surface.tsx` remains only as a compatibility/showcase adapter for token QA. New and migrated route surfaces use `apps/web/app/components/surface.tsx`.

Default primitive mapping:

| Need                  | Use                                                                         |
| --------------------- | --------------------------------------------------------------------------- |
| command/action        | `Button`, `ButtonGroup`, `Toggle`, `ToggleGroup`                            |
| state label           | `Badge`                                                                     |
| framed repeated item  | `Card`                                                                      |
| dense data            | `Table`                                                                     |
| segmented view        | `Tabs`                                                                      |
| form input            | `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Switch`, `Slider` |
| dialog flow           | `Dialog`, `AlertDialog`, `Sheet`, `Drawer`                                  |
| empty/no result/error | `Empty` or approved wrappers around `Empty`                                 |
| loading               | `Spinner`, `Skeleton`, `Progress`                                           |
| list row              | `Item`, `ItemGroup`                                                         |
| search/filter shell   | `InputGroup`, `Combobox` helpers where appropriate                          |
| route context         | `Sidebar`, `Breadcrumb`, `Separator`                                        |
| keyboard hint         | `Kbd`, `KbdGroup`                                                           |
| transient feedback    | `Sonner`                                                                    |

Toast and durable notification behavior is specified in `docs/spec/toast-notification-system.md`.

Allowed app wrappers:

- Data adapters that fetch, map, or validate domain data.
- Layout wrappers that arrange primitives without changing the visual contract and delegate to `apps/web/app/components/surface.tsx` when they represent page, header, section, toolbar, empty-state, or navigation-card patterns.
- Form wrappers in `apps/web/app/components/form/`.
- Domain wrappers that remove repetition while still rendering shadcn primitives.
- Documented wrappers that use generated `matu-*` tokens for visual QA or token-level implementation.

Forbidden wrappers:

- Wrappers that restyle a primitive into a new visual system.
- Page-specific clones of `Button`, `Badge`, `Card`, `Table`, `Tabs`, `Input`, or `Select`.
- Page-specific clones of app page/header/section/toolbar/empty-state/link-card adapters.
- Compatibility shims for a removed design system.
- Helpers named like legacy `app-*` surface classes.
- New unscoped `matu-*` wrappers outside the canonical surface adapter.

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
- Use semantic state tokens; any future dark/low-light operational mode must come from shared tokens, not route-local palettes.
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
- Route IA must stay anchored to three operator flows:
  1. Kiem soat ton: stock on hand, stocktake, expiry, waste/adjustment, reporting.
  2. Nhap/Nhan/Doi soat: purchase order, GRN, supplier invoice/price variance, receiving exceptions.
  3. Dieu phoi/San xuat: transfer, production order, BOM/recipe issue and yield.
- Sidebar group labels must be compact enough for the fixed rail. Use detail page headings and breadcrumbs for full workflow wording.
- Complex Inventory forms use RHF + Zod + app form helpers when they have line arrays, more than four fields, inline pre-submit validation, or pending submit UX. Plain `<form action>` is only for auth, sign out, or single-reason confirmations.
- Use Sonner for success/action-level feedback, inline field errors for validation, and `/access-denied?reason=` only for permission, auth, or scope failures.
- Entity audit history belongs inline on detail pages as a `Lich su` tab filtered by `audit_logs.entity_type` and `audit_logs.entity_id`. Tenant-wide audit search is a compliance surface, not the MVP detail-view default.
- Page is for long forms and line-heavy workflows, Sheet is for focused data entry, Dialog is for short contextual tasks, and AlertDialog is for destructive or irreversible confirmation.
- Inventory money, quantity, tax-rate, and business-date inputs must use the shared app form wrappers instead of ad hoc parsing or `type="number"`.
- Hide permanently unauthorized actions. Show disabled controls with explanatory copy only for temporary operational blockers such as missing shift, locked period, or incomplete prerequisite state.

### Employee

- Keep the surface narrow and task-led.
- Do not turn `/employee` into a second admin shell.
- Put cross-app work discovery in `/portal`.
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
