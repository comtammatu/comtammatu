---
# DESIGN.md — Cơm Tấm Má Tư design foundation
# Format: Google Labs Code DESIGN.md (YAML token front-matter + rationale body).
# Authority: per docs/plan/decisions.md D044, this file is the agent-facing design
# FOUNDATION. Runtime token source-of-record stays packages/ui/src/styles/globals.css;
# enforcement stays docs/spec/design-system.md. The three must agree (drift-guarded).
meta:
  name: Ma Tu Concept 01 — Elevated
  version: 1.0.0-target
  status: TARGET   # reform in progress — see "Status & Rollout" before migrating runtime
  direction: Upgrade existing Ma Tu identity (deeper + more consistent), not a reinvention
  runtime: light only (dark tokens authored for parity, unused at runtime)
  token_model: OKLCH only. Base tokens unchanged. Elevated tokens are ADDITIVE.
  changed_behaviors:   # the ONLY existing default outputs that change (defect fixes)
    - Button.default desktop hover (currently anchor-only, dead on <button>)
    - Input/SelectTrigger focus ring opacity (ring/30 fails WCAG 1.4.11)
    - Dialog/Sheet/Drawer/AlertDialog title scale (text-sm/medium under-ranks content)
    - Modal scrim bg-black/80 -> bg-foreground/70 (semantic-token compliance)

colors:
  # ---- BASE (unchanged; source-of-record = globals.css :root) ----
  background:        { oklch: "0.978 0.014 64.3", note: "kem gạo / warm cream — page L0" }
  foreground:        { oklch: "0.218 0.036 251.3", note: "xanh đậm / navy ink" }
  card:              { oklch: "1 0 0", note: "pure white — LOCKED, do not repoint" }
  popover:           { oklch: "1 0 0" }
  primary:           { oklch: "0.56 0.18 33", note: "đỏ gạch / terracotta — fills, on-fill" }
  primary-foreground: { oklch: "0.978 0.014 64.3" }
  secondary:         { oklch: "0.961 0.016 64.7" }
  muted:             { oklch: "0.956 0.014 67.7" }
  muted-foreground:  { oklch: "0.512 0.09 62.2", note: "nâu gỗ / supporting tone" }
  accent:            { oklch: "0.936 0.018 70.2" }
  border:            { oklch: "0.903 0.021 72.1", note: "base hairline — unchanged" }
  input:             { oklch: "0.903 0.021 72.1" }
  ring:              { oklch: "0.77 0.164 73.2", note: "vàng gạo / rice-yellow — focus + warning" }
  success:           { oklch: "0.609 0.086 137", note: "xanh lá dịu — fills/borders only" }
  warning:           { oklch: "0.77 0.164 73.2", note: "= ring — fills/borders only, NEVER text" }
  info:              { oklch: "0.218 0.036 251.3", note: "navy — KEPT (see info-accent)" }
  destructive:       { oklch: "0.466 0.147 33.3" }
  destructive-foreground: { oklch: "0.978 0.014 64.3" }
  tier-elite:        { oklch: "0.55 0.18 305", note: "purple — trust/variance/waste Elite badge only" }
  tier-note:         { oklch: "0.72 0.16 50",  note: "orange-mid — 3-tier ladder Note badge only" }
  chart-1:           { oklch: "0.56 0.18 33",   role: "Series1 / revenue / hero" }
  chart-2:           { oklch: "0.77 0.164 73.2", role: "Series2" }
  chart-3:           { oklch: "0.609 0.086 137", role: "Series3 / positive" }
  chart-4:           { oklch: "0.218 0.036 251.3", role: "Series4 / grayscale-survivable anchor" }
  chart-5:           { oklch: "0.512 0.09 62.2", role: "Series5 / reference" }

  # ---- ELEVATED, ADDITIVE (target; each MUST also define a .dark sibling) ----
  # Depth ladder (border-first, no new shadow tokens):
  surface-inset:   { oklch: "0.962 0.016 66", dark: "0.262 0.044 255", note: "L1 recessed well bg — retires bg-muted/20|/30, bg-background/70" }
  border-inset:    { oklch: "0.915 0.020 70", dark: "0.978 0.014 64.3 / 10%", note: "L1 well hairline" }
  border-raised:   { oklch: "0.872 0.026 70", dark: "0.978 0.014 64.3 / 22%", note: "L3 lifted-panel firmer edge (lift WITHOUT shadow)" }
  border-strong:   { oklch: "0.840 0.026 71", dark: "0.978 0.014 64.3 / 30%", note: "emphatic divider / strong field border" }
  navy-900:        { oklch: "0.160 0.030 252", dark: "0.978 0.014 64.3", note: "AAA max-contrast ink + scrim source" }
  info-accent:     { oklch: "0.55 0.13 248", dark: "0.70 0.12 248", note: "OPTIONAL cool-blue accent. Default: info stays navy. Re-hue = owner decision (D044 §Info)." }
  chart-grid:      { oklch: "0.903 0.021 72.1 / 60%", dark: "0.978 0.014 64.3 / 12%" }
  chart-axis:      { oklch: "0.512 0.09 62.2", dark: "0.782 0.014 78.2" }

  # Semantic soft/ink PAIRS — {tone}-ink ON {tone}-soft is the guaranteed-AA status-text surface.
  # -ink is also text-safe directly on white/cream. -soft is a tint background only.
  primary-soft:     { oklch: "0.940 0.030 36" }
  primary-ink:      { oklch: "0.430 0.150 32", note: "terracotta TEXT (base 0.56 is borderline as text)" }
  success-soft:     { oklch: "0.945 0.045 140", gamut_check: true }
  success-ink:      { oklch: "0.430 0.075 138" }
  warning-soft:     { oklch: "0.962 0.040 78", gamut_check: true }
  warning-ink:      { oklch: "0.520 0.110 70", note: "the ONLY legal way to render warning as text" }
  info-soft:        { oklch: "0.945 0.035 245" }
  info-ink:         { oklch: "0.400 0.090 250" }
  destructive-soft: { oklch: "0.945 0.040 32" }
  destructive-ink:  { oklch: "0.466 0.147 33.3", note: "alias of destructive (already AA)" }

  # Neutral/primary selection + state alpha ladder (alpha-on-existing-token; NOT for status text):
  state_alpha: { wash: "/8", fill: "/12", border: "/35", border-strong: "/55", ring: "/50", solid: "1" }

typography:
  fonts:
    sans:    { family: Geist,      var: "--font-sans / --font-heading", use: "body + headings (single family)" }
    mono:    { family: Geist Mono, var: "--font-mono", use: "tabular operational data: money, qty, ID, code, time" }
  root_px: 17
  weights: { regular: 400, medium: 500, semibold: 600, bold: 700, black: BANNED }
  leading:  { display: 1.0, heading: 1.2, snug: 1.35, body: 1.5, relaxed: 1.6 }
  tracking: { tight: "-0.01em (font-heading titles only)", normal: "0", wide: "0.025em (page eyebrow)", wider: "0.05em (dense/table eyebrow)" }
  measure:  { prose: "66ch (running body)", narrow: "46ch (dialog/alert body)" }
  numeric:  { features: "'tnum' 1, 'lnum' 1, 'zero' 1 on .font-mono + tabular-nums" }
  scale:    # role -> class (locked §B strings preserved; leading/tracking annotated)
    page-h1:        "font-heading text-xl sm:text-2xl font-semibold tracking-tight  / leading-heading"
    section-title:  "font-heading text-base font-semibold                          / leading-snug"
    sub-title:      "font-heading text-sm font-semibold                            / leading-snug"
    body:           "text-sm                                                       / leading-body   (LIFT: Card base text-xs -> text-sm)"
    small:          "text-xs                                                       / leading-snug"
    eyebrow:        "text-xs font-medium uppercase tracking-wide"
    table-head:     "text-xs font-medium uppercase tracking-wider text-muted-foreground"
    dense-eyebrow:  "text-2xs font-medium uppercase tracking-wider"
    numeric-echo:   "text-3xl font-semibold tabular-nums                           / leading-display"
    modal-title:    "font-heading text-base font-semibold  (LIFT from text-sm font-medium)"
    pos-line:       "text-base  (LIFT: POS cart line + KDS item names, arm's-length legibility)"
    runner-board:   "text-runner-* (dvh-clamp display tokens; never viewport-width)"
  banned: ["text-4xl/5xl in app", "font-black", "third font family", "arbitrary text-[..]", "leading-[..]", "viewport-width type"]

rounded:
  scale:   # 4 tiers only — lint-enforced
    control: { token: rounded-md, px: 8,  roles: "input, button, badge, chip, icon-box, inset, alert" }
    card:    { token: rounded-lg, px: 10, roles: "Card, Sheet, Dialog, Drawer outer, page-container" }
    pill:    { token: rounded-full,       roles: "avatar, pill badge, circular icon container" }
    reset:   { token: rounded-none,       roles: "table-cell internals, edge-bleed media" }
  nesting: "child steps DOWN one tier (rounded-md inset inside rounded-lg card). Never rounded-lg inside rounded-lg."
  banned: ["rounded (bare)", "rounded-sm", "rounded-xl/2xl/3xl/4xl in app code"]

spacing:
  gap_roles: { "1": "icon+label", "1.5": "chip cluster", "2": "inline row / fields", "3": "in-section", "4": "section stack", "6": "multi-column gutter ONLY" }
  banned_gaps: ["5", "7", "8 (horizontal)", "space-y-* for stacks"]
  padding_owner: "AppPage (page) + Card (card) only. Leaf pages never set root p-*."
  density: { comfortable: "p-4 / gap-4", compact: "p-3 / gap-3 (AppPage density + Card size=sm)" }
  breakpoints: { sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536 }
  widths: { narrow: max-w-xl, default: max-w-5xl, wide: max-w-7xl, full: max-w-none, mobile: max-w-2xl }
  divider_opacity: ["border-border", "border-border/60", "border-border/40"]   # nothing below /40

elevation:
  model: "border-first. Resting surfaces separate by background-tint then border-tint. Shadow ONLY for surfaces that float over scrolling content."
  cue_order: ["1 background-tint step", "2 border-tint step", "3 shadow rung (float only)"]
  layers:
    L0_page:    { surface: "{background} cream" }
    L1_inset:   { surface: "{surface-inset}", border: "{border-inset}", radius: rounded-md }
    L2_card:    { surface: "{card} white",    border: "{border}",       radius: rounded-lg }
    L3_raised:  { surface: "{card}",          border: "{border-raised}", note: "lift via firmer border, NOT shadow" }
    L4_overlay: { surface: "{card}", shadow: shadow-md, roles: "popover, dropdown, select, menu, hover-card" }
    L5_modal:   { surface: "{card}", shadow: shadow-lg, roles: "dialog, sheet, drawer, sticky CTA bar" }
    L6_ceiling: { surface: "{card}", shadow: "shadow-xl / shadow-2xl", roles: "POS mobile action bar, KDS focus card — nowhere else" }
  shadow_rungs: { rest: "border only", hover: shadow-sm, overlay: shadow-md, modal: shadow-lg, ceiling: "shadow-xl/2xl" }
  selected: "border-primary/60 + ring-2 ring-primary/55 + bg-primary/8. NO shadow (resting-shadow freeze)."
  banned: ["resting shadow on Card/section/row/tile", "new --shadow-* tokens", "shadow as selection signal", "hover:shadow-md+"]

motion:
  durations: { fast: "150ms (color/focus/border/press)", overlay: "300ms (dialog/sheet enter-exit)", idle: "500ms (Runner idle board ONLY)" }
  easing: { default: "transition (bare)", enter: ease-out, continuous: "ease-linear (spinner/progress only)" }
  press_by_tier:
    control: "active:translate-y-px   (Button <=36px, inline chips — no scale)"
    row:     "active:scale-[0.99]     (InteractiveCard, list rows, OperationalTile, mobile Item)"
    tile:    "active:scale-[0.97]     (POS menu/table-gate tiles, KDS touch/touch-lg, size=tile, icon-touch)"
  focus_ring:
    control: "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/55"
    surface: "focus-visible:ring-[3px] focus-visible:ring-ring/55"
    fallback: "if /55 fails a real 3:1 contrast check, use SOLID ring-ring"
  transition_lists: "explicit only (transition-all banned): controls transition-[background-color,border-color,color,box-shadow,transform]; press transition-transform; focus transition-[color,box-shadow]"
  states: [default, hover, "active(press)", focus-visible, disabled, loading, selected, error]
  reduced_motion: "global @media(prefers-reduced-motion) reset zeroes all animation/transition. Every state must be legible from its end-state alone."
  banned: ["animation library", "custom @keyframes outside globals.css", "active:scale < 0.97", "hover:scale grow on ERP", "transition-colors + duration-300"]

components:   # anatomy lives in body §Components; key token deltas here
  button:   { fix: "default add hover:bg-primary/90 (non-anchor)", add: "loading prop (Spinner + aria-busy)", sizes: "xs/sm/default/lg/touch/touch-lg/icon-*/tile (unchanged)" }
  badge:    { add: "size cva sm=h-5/default=h-6/touch=min-h-7 + dot boolean" }
  input:    { add: "size cva sm=h-6/default=h-7/lg=h-10 (replaces form/* h-10 hack)/touch=min-h-12", fix: "focus ring -> ring-ring/55" }
  card:     { add: "variant default | raised (KPI/dashboard, lift via border-raised + border-t accent, NO shadow) | inset (bg-surface-inset)" }
  section:  { change: "SECTION_TONE bg-{tone}/5 -> bg-{tone}/8, border-{tone}/40 -> /35; add accent border-l-4" }
  table:    { add: "density data-attr comfortable(h-10) | compact(h-8) + data-[severity] border-l-2" }
  tabs:     { change: "line underline after:bg-foreground -> after:bg-primary; add data-active:font-semibold" }
  dialog_sheet_drawer_alert: { fix: "title -> font-heading text-base font-semibold; scrim -> bg-foreground/70 backdrop-blur-xs" }
  statusbadge: { wire: "existing getStatusDotClassName via new Badge dot prop (color-not-sole-signal)" }
  kpicard:  { add: "emphasis=hero: Card raised + border-t-2 border-t-primary/35 + icon well bg-primary/12" }
  operationaltile: { change: "selected -> border-primary/60 ring-2 ring-primary/55 bg-primary/8 (NO shadow)" }
  spinner_skeleton_progress: { add: "size sm/default/lg; Skeleton variant text/circle/block" }
---

# DESIGN.md — Cơm Tấm Má Tư (Má Tư Concept 01, Elevated)

> Agent-facing design **foundation**. Read this before any UI work. It carries the
> token values **and** the design intent behind them. Per `docs/plan/decisions.md`
> **D044** it sits above `docs/spec/design-system.md` (which keeps the enforcement
> rules, authority order, and lint ratchets) and is mirrored to
> `packages/ui/src/styles/globals.css` (the runtime token source-of-record).

## Status & Rollout

**This file describes the TARGET system.** The reform direction is owner-locked
(D044): *upgrade* the existing Má Tư identity — deeper and more consistent — across
all surfaces (POS, KDS/Runner, Admin, Inventory, Employee). It is **not** a
reinvention.

Until the code phase lands (gated on owner mockup approval), the **runtime
source-of-record is still `globals.css` + `design-system.md`**. Do **not** migrate
runtime tokens to the elevated values here until the mockups are approved. The
intentional drift between this file (target) and `globals.css` (current) is
expected during the reform; the drift-guard lint goes live only when `globals.css`
is migrated to match.

The upgrade is **additive**: base tokens keep their names and values; everything
new is an additional token or an additional cva variant/prop with a back-compatible
default. The **only** existing default outputs that change are four named defect
fixes (Button hover dead-zone, Input/Select focus-ring contrast, modal title rank,
modal scrim semantic compliance).

## Overview

Cơm Tấm Má Tư is an operational restaurant system — POS, kitchen display, admin,
inventory, employee. The interface must feel **calm, fast, touch-safe, and
business-specific**. The identity is *cơm tấm* warmth made disciplined: a **rice-cream**
(`kem gạo`) page foundation, **terracotta** (`đỏ gạch`) for the single primary action,
**deep navy** (`xanh đậm`) ink, **rice-yellow** (`vàng gạo`) for focus and attention,
restrained borders, semantic status color, and strict spacing.

The diagnosis from the surface audit: the system is **flat**. Sidebars, panes,
headers, and content all sit on near-identical white/cream with a single 60%-opacity
hairline between them; the only real depth on the whole app is the POS mobile
floating bar. The upgrade's core move is therefore **depth without breaking
border-first discipline**: a layered surface ladder built from background-tint and
border-tint steps (`surface-inset`, `border-raised`), reserving shadow strictly for
surfaces that genuinely float. Everything else — richer semantic text colors, a real
body type step, complete and unified interaction states, color-plus-second-signal
status — serves the same goal: make hierarchy legible without adding noise.

**Design principles**

1. **Border-first depth.** Separate surfaces with tone and border before reaching for
   shadow. Shadow means *floating*, not *important*.
2. **Additive, never rename.** New need → new token/variant. Re-valuing a base token
   is a contract change, not a styling choice.
3. **One mechanism per state, per role.** Selected is ring+border+bg. Focus is the
   amber ring. Never two signals for one state.
4. **Touch-safe legibility overrides density.** POS/KDS text and targets never shrink
   below their floor to win density.
5. **Color is never the only signal.** Every status pairs color with a label, dot, or
   border tier.
6. **The primitive owns the value.** Density, height, radius, motion live in the cva /
   token, consumed by prop — never hand-patched per page.

## Colors

Source-of-record for values is the YAML above (mirrored to `globals.css`). This
section is the **usage contract**.

### Roles

| Token | Use | Never |
| --- | --- | --- |
| `background` (cream) | page L0 canvas | as a card/panel surface to fake depth |
| `card` (white) | every framed surface (Card, pane, header tier) | repoint off pure white |
| `surface-inset` | recessed wells: cart subtotal, cash-change, KDS item panel, quantity wells, summary boxes, camera frame | as a top-level page background |
| `primary` (terracotta) | the **one** primary action per view, on-fill text, chart-1 | status meaning, body text |
| `primary-ink` | terracotta **text** on light surfaces / on `primary-soft` | as a fill |
| `ring` (rice-yellow) | focus ring, `warning` fill | as body or status text |
| `success` / `warning` / `info` / `destructive` | status **fill + border** | colored **text** (use `-ink` on `-soft`) |
| `{tone}-ink` on `{tone}-soft` | the only AA-guaranteed status **text** surface | mixing `-ink` with a non-`-soft` tinted bg |
| `tier-elite` / `tier-note` | trust/variance/waste tier badges only | general accents |

### Surface ladder (the depth fix)

```
L0 page      background (cream)
L1 inset     surface-inset  + border-inset      rounded-md   ← recessed wells
L2 card      card (white)   + border            rounded-lg   ← default framed surface
L3 raised    card (white)   + border-raised                  ← lifted panel (no shadow)
L4 overlay   card           + shadow-md                      ← popover/menu/select
L5 modal     card           + shadow-lg                      ← dialog/sheet/drawer
L6 ceiling   card           + shadow-xl/2xl                  ← POS bar, KDS focus card
```

Give POS/KDS panes a real tier: menu area on `background`, cart/order-list panes on
`card`, recessed rows on `surface-inset`. That single change resolves most of the
"everything is one white sheet" audit finding without a single shadow.

### `info` decision (open)

The audit proposed re-hueing `info` from navy to cool blue. That is the **one**
genuinely non-additive change in the whole upgrade. **Default: `info` stays navy**;
a separate additive `info-accent` (cool blue) is available for callouts/charts that
want a blue. Re-hueing `info` itself requires an explicit owner decision logged in
`decisions.md` with a full `info` call-site audit (it currently doubles as KPI/board
ink). Surface this at mockup review; do not let it ride in as "additive".

### Rules

- OKLCH only. No hex/rgb/hsl. No raw Tailwind palette (`bg-amber-500`) — semantic
  tokens only. Two carved exceptions, named: the POS food-photo gradient
  (`black/80→black/35→transparent`) and `pos-text-overlay` drop-shadow exist for
  legibility over arbitrary uploaded food photos.
- Every new token defines **both** `:root` and `.dark` (lint `token-pair` /
  `rules-mirror`), even though runtime is light.
- `success-soft` / `warning-soft` are high-L + non-trivial chroma — **gamut-check in
  sRGB** at code phase; a clipped soft token silently breaks its `-ink`-on-`-soft` AA
  guarantee.

## Typography

Geist (sans, body **and** headings) + Geist Mono (tabular data). Root `17px`. No
third font, ever.

The headline lift: the `Card` primitive body base moves from `text-xs` to **`text-sm`
leading-body**, giving the entire admin/inventory/employee stack a real body step
instead of label-sized copy. POS cart lines and KDS item names step up to
**`text-base`** for arm's-length and kitchen legibility. Dialog/Sheet titles move to
**`font-heading text-base font-semibold`** so floating chrome out-ranks the section
chrome it contains.

| Role | Class (locked §B strings kept) | Leading |
| --- | --- | --- |
| Page H1 | `font-heading text-xl sm:text-2xl font-semibold tracking-tight` | heading |
| Section title | `font-heading text-base font-semibold` (`CardTitle`) | snug |
| Sub / list head | `font-heading text-sm font-semibold` | snug |
| Body | `text-sm` | body |
| Small / meta | `text-xs` | snug |
| Eyebrow | `text-xs font-medium uppercase tracking-wide` | — |
| Table head | `text-xs font-medium uppercase tracking-wider text-muted-foreground` | — |
| Dense eyebrow | `text-2xs font-medium uppercase tracking-wider` | — |
| Numeric echo | `text-3xl font-semibold tabular-nums` | display |
| Modal title | `font-heading text-base font-semibold` | snug |
| POS line / KDS item | `text-base` | body |
| Runner board | `text-runner-*` (dvh clamp) | display |

- New `--leading-*`, `--tracking-*`, `--measure-*` land as a single `@theme inline`
  block → Tailwind utilities (no arbitrary `text-[..]` / `leading-[..]`).
- `--measure-prose` (66ch) applies to running text **only**: `CardDescription`,
  `AppPageHeader` description, `Alert` body. Never to table cells, labels, or POS/KDS
  data.
- Weights: 400/500/600/700 only. `font-bold` reserved for receipt totals, KPI hero,
  print headers, inline emphasis. `font-black` banned.
- `font-feature-settings 'tnum'/'lnum'/'zero'` on `.font-mono` + `tabular-nums` to
  harden ledger alignment. A money/qty cell without `font-mono` is drift.

## Layout

Mobile is the baseline IA; desktop adds density and scan speed, never a different
information architecture.

- **Padding owners:** `AppPage` (page) and `Card` (card) only — applied once, never
  compounded. Leaf pages set no root padding.
- **Density:** `AppPage density="compact"` + `Card size="sm"` are the two switches;
  no per-module `*-dense` classes.
- **Widths:** `narrow` `max-w-xl` · `default` `max-w-5xl` · `wide` `max-w-7xl` ·
  `full` `max-w-none` · `mobile` `max-w-2xl`. Declare width explicitly per template.
- **Breakpoints:** 640 / 768 / 1024 / 1280 / 1536. Switch layout on **CSS breakpoint
  classes, not a JS `isMobile` flag**.
- **Gap roles:** `1` icon+label · `1.5` chip · `2` inline · `3` in-section · `4`
  section stack · `6` multi-column gutter **only**. No `5/7/8`; no `space-y-*` for
  stacks.

**Page templates** (composable skeletons): `T1` list+filter (wide) · `T2` detail+tabs
(default) · `T3` document + line-sheet (default) · `T4` dashboard/KPI (wide) · `T5`
operational board POS/KDS (full) · `T6` task portal Employee (mobile). Filters route
through `AppToolbar`; lists through `DataTable`.

## Elevation & Depth

Border-first. Express resting depth with the **3-cue stack in order**: background-tint
step → border-tint step → (float only) a shadow rung. On L1–L3, stop at cues 1–2.

- Every recessed well = `bg-surface-inset` + `border-border-inset` + `rounded-md`.
  This retires all ad-hoc `bg-muted/20`, `bg-muted/30`, `bg-background/70`.
- Lifted panels (home hero, selected board card, sticky chrome) = `border-border-raised`
  to signal lift **without** shadow.
- Shadow rungs are **unchanged and reused**: `shadow-sm` (hover + floating chrome),
  `shadow-md` (overlay), `shadow-lg` (modal/sheet/sticky CTA), `shadow-xl/2xl`
  (ceiling). No new shadow tokens, no arbitrary `shadow-[..]`.
- **Selected ≠ elevated.** Selection is `border-primary/60 + ring-2 ring-primary/55 +
  bg-primary/8`. No `shadow-sm` on selected tiles or KPI hero — those lift via
  `border-raised` + a `border-t` accent. (This keeps the `resting-shadow-rung` gate
  green; adding selected-shadow is a hard CI break.)
- **Dividers:** the locked 3-value opacity ladder `border-border` / `/60` / `/40`.
  Nothing below `/40`; no per-surface divider opacities.
- **Focus ring** is the rice-yellow `ring` at `/55` (raised from the failing `/30` on
  inputs) — a separate ring from the terracotta selection ring, so they coexist.

## Shapes

Radius is a **tier, not a free choice** — 4 tokens, lint-enforced.

| Tier | Token | Roles |
| --- | --- | --- |
| Control | `rounded-md` (8px) | input, button, badge, chip, icon-box, inset, alert |
| Card | `rounded-lg` (10px) | Card, Sheet, Dialog, Drawer outer, page-container |
| Pill | `rounded-full` | avatar, pill badge, truly-circular icon container |
| Reset | `rounded-none` | table-cell internals, edge-bleed media |

- **Nesting steps down one tier:** `rounded-md` insets inside `rounded-lg` cards.
  Never `rounded-lg` inside `rounded-lg` (fixes the POS cart `Item` and KDS panel
  collisions).
- Banned in app: bare `rounded`, `rounded-sm`, `rounded-xl/2xl/3xl/4xl`. The
  `--radius-*` primitive surface exists for shadcn compatibility — consumed indirectly
  through Card/Sheet, never directly.

## Components

All components map to `packages/ui/src/components/*` primitives + `surface.tsx`
adapters. Changes are **additive cva variants / optional props with back-compat
defaults**, except the four named defect fixes. Implement the full 8-state matrix
(default/hover/active/focus-visible/disabled/loading/selected/error) on every
interactive primitive, one mechanism per state.

| Component | Elevation of state / anatomy |
| --- | --- |
| **Button** | DEFECT FIX: `default` add `hover:bg-primary/90` (non-anchor — currently dead on desktop). Add `loading` prop = `aria-busy` + leading `Spinner`, control stays disabled, dimming suppressed. Press by tier (translate vs scale). Focus = control ring. Sizes unchanged. |
| **Badge / StatusBadge** | Add `size` cva (`sm` h-5 / `default` h-6 / `touch` min-h-7) + `dot` boolean wired to the existing `getStatusDotClassName` (color-not-sole-signal). |
| **Card / AppSection** | Add `variant` `default | raised | inset`. `raised` (KPI/dashboard) lifts via `border-raised` + `border-t` accent — **no shadow**. `inset` = `bg-surface-inset`. `SECTION_TONE` deepens `bg-{tone}/5→/8`, `border/40→/35`, add accent `border-l-4`. |
| **Input + form fields** | Add `size` cva (`sm` h-6 / `default` h-7 / `lg` h-10 — routes the `form/*` h-10 hack through a real variant / `touch` min-h-12). DEFECT FIX: focus ring `/30→/55`. |
| **Select / Combobox** | Same focus-ring fix; trigger height via the field `size` model, not ad-hoc h-*. |
| **Table / DataTable** | `density` data-attr `comfortable` (h-10) / `compact` (h-8) + `data-[severity]` left border. Money/qty/price/rate cells `text-right font-mono tabular-nums`. One empty treatment per breakpoint. |
| **Tabs** | Line underline `after:bg-foreground → after:bg-primary`; add `data-active:font-semibold`. |
| **Dialog / Sheet / Drawer / AlertDialog** | DEFECT FIX: title → `font-heading text-base font-semibold`; scrim `bg-black/80 → bg-foreground/70 backdrop-blur-xs` (semantic). |
| **Empty / AppEmptyState** | `EmptyMedia` icon `size-8`–`size-12`; copy from `@comtammatu/shared/messages`. |
| **KpiCard** | `emphasis="hero"` = Card `raised` + `border-t-2 border-t-primary/35` + icon well `bg-primary/12 text-primary`. Value `text-2xl font-bold tabular-nums`. |
| **OperationalTile / BoardCard** | Selected = `border-primary/60 ring-2 ring-primary/55 bg-primary/8` (no shadow). BoardCard urgency = `border-l-4`. |
| **Sidebar / nav** | Active = `3px` rail (`before:bg-sidebar-primary`) + `data-active` icon tint. Same resolved nav model desktop + bottom-nav. |
| **Toast (Sonner)** | Per `docs/spec/toast-notification-system.md`; `aria-live` on dynamic regions. |
| **Spinner / Skeleton / Progress** | Add `size` (sm/default/lg). Skeleton `variant` text/circle/block. No skeleton inside an actionable button — loading is Spinner + `aria-busy`. |

The price badge on POS menu cards routes through a `Badge variant="price"`
(`bg-primary text-primary-foreground`) instead of a raw `bg-primary` span.

## Do's and Don'ts

**Do**
- Separate surfaces with the L0–L6 ladder (tone → border → shadow-only-if-floating).
- Keep all changes additive; touch a base token's value only via a logged contract
  decision.
- Use `{tone}-ink` on `{tone}-soft` for any status **text**; keep base `{tone}` for
  fills/borders.
- Pair every status color with a second signal (VN label, dot glyph, left-border tier).
- Pull touch sizing from `size="touch"/"touch-lg"/"icon-touch"` props; hold the
  `min-h-12` floor on POS/KDS/Employee interactive controls.
- Add density/state as a cva value on the primitive and consume by prop.
- Render money via `formatVND`, dates via `@comtammatu/shared/time`, numeric
  comparison cells `font-mono tabular-nums`.
- Land each token/role change atomically across the six `design-system.md §B` sync
  targets; ship every new lint ratchet as a count-down baseline (freeze existing,
  block new), one primitive wave per PR.

**Don't**
- Add a resting shadow to any Card/section/row/tile, or use shadow as a selection
  signal. Border-first is inviolable.
- Repoint `--card` off pure white, or re-value any base token silently.
- Render `text-warning` on white, or signal status by color alone.
- Introduce a new hue/namespace for severity — every state is an alpha step or a
  `-soft`/`-ink` pair on an existing semantic token.
- Add a third font, `font-black`, `text-4xl/5xl` in app, arbitrary `text-[..]` /
  `leading-[..]`, or viewport-width type.
- Add a new duration/easing, an animation library, `@keyframes` outside `globals.css`,
  `active:scale < 0.97`, `hover:scale` grow on ERP, or `transition-colors` +
  `duration-300`.
- Use `rounded` (bare) / `rounded-sm` / `rounded-xl+`, or nest `rounded-lg` in
  `rounded-lg`.
- Fake a primitive: no page-local Button/Badge/Card/Table/StatCard/StatusBadge clones,
  no `className="min-h-12"` faking a touch target, no `space-y-*` section stacks.
- Ship an icon-only control without an `aria-label`/`sr-only` from the copy ladder.

## Motion & Interaction States

(Extends the canonical sections; the functional-only, no-library, two-duration
constraint is inviolable.)

- **Durations:** `150ms` color/focus/border/press · `300ms` overlay enter-exit ·
  `500ms` Runner idle board only. No new values; no arbitrary `duration-[..]`.
- **Press by physical tier:** `translate-y-px` (Button ≤36px) · `scale-[0.99]`
  (rows/cards) · `scale-[0.97]` (tiles/touch). Large *Buttons* translate; *tiles*
  scale.
- **Focus:** control `border-ring ring-2 ring-ring/55`; surface `ring-[3px]
  ring-ring/55`. One vocabulary, two sizes. (If `/55` fails a real 3:1 check → solid
  `ring-ring`.)
- **Selected:** ring+border+bg, no shadow. **Disabled:** `opacity-50
  pointer-events-none`, instant. **Loading:** `aria-busy` + Spinner, dimming
  suppressed. **Error:** `aria-invalid:border-destructive ring-2 ring-destructive/20`
  (error beats focus).
- Explicit `transition-[...]` property lists only; `transition-all` banned. Reduced
  motion zeroes everything — every state legible from its end-state.

## Iconography, Data-viz & Brand

- **Icons:** Lucide. `strokeWidth` only at sanctioned points — `2.25` (≤size-3.5),
  `2` default (size-4/5, never set), `1.75` (size-6 eyebrow), `1.5` (size-8–12
  EmptyMedia). Size by role `size-3`→`size-6`; banned `size-7/9/11`. Tone via role
  class + boxed `bg-{tone}/10 rounded-md`. Never substitute an icon for a
  money/qty/ID number; never icon-only for status or destructive on POS/KDS.
- **Data-viz:** every chart through `ChartContainer` + `ChartConfig` referencing
  `var(--chart-N)` or a status var. `chart-1` = hero, `chart-4` navy = grayscale-survivable
  anchor. **Max 3 categorical hues** before a mandatory non-hue cue (shape / dash /
  direct label); pie >3 slices needs legend + value labels. Axis `text-3xs
  text-muted-foreground tabular-nums`, `Intl.NumberFormat('vi-VN', compact)`,
  `CartesianGrid '3 3'`. Status sparklines use `var(--success)/--warning/--destructive`
  — never mapped onto `chart-N`. Empty = dashed well + `Chưa có dữ liệu…`; loading =
  skeleton at chart aspect. VN `aria-label` + `role="img"` on every chart.
- **Brand:** `BrandMark` / `BrandLockup` only — never `/brand/logo-*` direct. Patterns
  (`ke-caro`/`hat-gao`/`vong-to`) as edge decoration only, ≤15% opacity near text, max
  1 pattern/viewport, never behind body text/tables/forms. Mascot idle/customer-facing
  only (`motion-safe`-gated), never in workflow/dialogs/as an icon. Print receipt =
  monochrome lockup that survives the `@media print` black-on-white reset.

## Voice, Tone & Accessibility

- **Voice:** utility over marketing; Vietnamese internal UI. Imperative verb-first
  buttons, declarative status. Keep acronyms `POS/KDS/GRN/WAC/tenant`. No `bạn`/`quý
  khách` in chrome (except `ERRORS_VI.forbidden` + customer-facing Runner/receipt). No
  `!`, emoji, or literal `...` (use `…`); `—` (U+2014) for null. Copy ladder: glossary
  → `labels/vi.ts` → `messages` — reach for the lowest rung that already has the key;
  promote a literal to a shared rung the moment it appears in a 2nd route family.
- **Formatting:** `formatVND` → `45.000đ`; dates `dd/MM/yyyy`, `HH:mm`,
  `Asia/Ho_Chi_Minh`, `vi-VN`. Never page-local money/date formatters.
- **Accessibility:** focus-visible on every control. Touch floors `min-h-12`
  (48px) / `touch-lg` `min-h-14` / `icon-touch` `size-12`; Admin dense-row exception
  floor `h-9` (36px) / 44px effective hit area. Color is never the sole status signal
  (label + dot + border tier). Every icon-only control gets an `aria-label`/`sr-only`
  from a ladder key (~184 existing aria-labels baselined, not day-one hard fail).
  `aria-live` on toasts and KDS ticket/age counts; one skip link per shell. All
  contrast pairs verified with a tool at code phase (AA body, AAA where feasible).

## Authority & enforcement

- **This file** = design foundation (tokens + intent). Agents and design tools read it
  first.
- **`docs/spec/design-system.md`** = enforcement layer (authority order, ratchets,
  allowlists, surface contracts, lint) — it points here for tokens + aesthetic.
- **`packages/ui/src/styles/globals.css`** = runtime token source-of-record; mirrored
  to this file's YAML, drift-guarded (pattern: `AGENTS.md ↔ engineering.md`,
  `pnpm lint:rules-mirror`). The drift-guard goes live when `globals.css` is migrated
  at the code phase.
- Decision of record: `docs/plan/decisions.md` **D044**.
